import { mkdir, rm, stat } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import {
  createProjectStateStore,
  type NativeProjectStateOptions,
  type ProjectStateDocument,
} from "./native-project-state.server.ts";
import type { ProjectStateInput } from "./native-project-state.server.ts";

export type ConflictChoice = "local" | "remote";

export interface ProjectStateConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

export interface ProjectStateMergeResult {
  merged: ProjectStateDocument;
  conflicts: ProjectStateConflict[];
}

export class ProjectStateConflictError extends Error {
  readonly current: ProjectStateDocument | null;
  readonly baseChecksum: string | null;

  constructor(message: string, current: ProjectStateDocument | null, baseChecksum: string | null) {
    super(message);
    this.name = "ProjectStateConflictError";
    this.current = current;
    this.baseChecksum = baseChecksum;
  }
}

export interface ProjectStateSyncEvent {
  kind: "changed" | "conflict" | "error";
  document?: ProjectStateDocument | null;
  conflicts?: ProjectStateConflict[];
  error?: Error;
}

export interface SynchronizedProjectStateStore {
  readonly projectId: string;
  readonly statePath: string;
  load(): Promise<ProjectStateDocument | null>;
  save(baseChecksum: string | null, input: ProjectStateInput): Promise<ProjectStateDocument>;
  merge(
    base: ProjectStateDocument,
    local: ProjectStateDocument,
    remote?: ProjectStateDocument | null,
  ): Promise<ProjectStateMergeResult>;
  resolve(
    merge: ProjectStateMergeResult,
    choices: Record<string, ConflictChoice>,
  ): ProjectStateInput;
  subscribe(listener: (event: ProjectStateSyncEvent) => void): () => void;
  close(): void;
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: ProjectStateConflict[],
): unknown {
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base) || equal(local, remote)) return clone(local);
  if (
    local &&
    remote &&
    typeof local === "object" &&
    typeof remote === "object" &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const result: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(base as Record<string, unknown>),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);
    for (const key of keys)
      result[key] = mergeValue(
        (base as Record<string, unknown>)[key],
        (local as Record<string, unknown>)[key],
        (remote as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        conflicts,
      );
    return result;
  }
  if (
    Array.isArray(local) &&
    Array.isArray(remote) &&
    local.every((item) => item && typeof item === "object" && "id" in item) &&
    remote.every((item) => item && typeof item === "object" && "id" in item)
  ) {
    const baseItems = new Map(
      (Array.isArray(base) ? base : []).map((item) => [String((item as { id: unknown }).id), item]),
    );
    const localItems = new Map(local.map((item) => [String((item as { id: unknown }).id), item]));
    const remoteItems = new Map(remote.map((item) => [String((item as { id: unknown }).id), item]));
    const ids = [...new Set([...baseItems.keys(), ...localItems.keys(), ...remoteItems.keys()])];
    return ids
      .map((id) =>
        mergeValue(
          baseItems.get(id),
          localItems.get(id),
          remoteItems.get(id),
          `${path}[${id}]`,
          conflicts,
        ),
      )
      .filter((item) => item !== undefined);
  }
  conflicts.push({ path, base: clone(base), local: clone(local), remote: clone(remote) });
  return clone(remote);
}

export function mergeProjectStateDocuments(
  base: ProjectStateDocument,
  local: ProjectStateDocument,
  remote: ProjectStateDocument,
): ProjectStateMergeResult {
  const conflicts: ProjectStateConflict[] = [];
  const content = mergeValue(
    {
      session: base.session,
      operations: base.operations,
      ledger: base.ledger,
      voiceMacros: base.voiceMacros,
      metadata: base.metadata,
    },
    {
      session: local.session,
      operations: local.operations,
      ledger: local.ledger,
      voiceMacros: local.voiceMacros,
      metadata: local.metadata,
    },
    {
      session: remote.session,
      operations: remote.operations,
      ledger: remote.ledger,
      voiceMacros: remote.voiceMacros,
      metadata: remote.metadata,
    },
    "",
    conflicts,
  ) as ProjectStateInput;
  return {
    merged: {
      ...clone(remote),
      ...content,
      savedAt: remote.savedAt,
      checksum: remote.checksum,
    },
    conflicts,
  };
}

function inputFromDocument(document: ProjectStateDocument): ProjectStateInput {
  return {
    session: clone(document.session),
    operations: clone(document.operations),
    ledger: clone(document.ledger),
    voiceMacros: clone(document.voiceMacros),
    metadata: document.metadata ? clone(document.metadata) : undefined,
  };
}

function setConflictValue(target: unknown, parts: string[], value: unknown): void {
  if (!parts.length || !target || typeof target !== "object") return;
  const [part, ...rest] = parts;
  if (Array.isArray(target)) {
    const item = target.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        String((candidate as { id?: unknown }).id) === part,
    );
    if (item) setConflictValue(item, rest, value);
    return;
  }
  const record = target as Record<string, unknown>;
  if (!rest.length) record[part] = clone(value);
  else setConflictValue(record[part], rest, value);
}

export function createSynchronizedProjectStateStore(
  options: NativeProjectStateOptions & { lockTimeoutMs?: number },
): SynchronizedProjectStateStore {
  const store = createProjectStateStore(options);
  const lockPath = `${store.statePath}.lock`;
  const lockTimeoutMs = options.lockTimeoutMs ?? 10_000;
  const listeners = new Set<(event: ProjectStateSyncEvent) => void>();
  const watchers = new Set<FSWatcher>();
  let closed = false;
  let lastChecksum: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function withLock<T>(operation: () => Promise<T>): Promise<T> {
    const started = Date.now();
    while (true) {
      try {
        await mkdir(lockPath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const details = await stat(lockPath);
          if (Date.now() - details.mtimeMs > lockTimeoutMs)
            await rm(lockPath, { recursive: true, force: true });
        } catch {
          /* The owner may have released the lock between stat and cleanup. */
        }
        if (Date.now() - started > lockTimeoutMs * 2)
          throw new Error("Timed out waiting for the project-state lock.");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      return await operation();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }

  function emit(event: ProjectStateSyncEvent): void {
    for (const listener of listeners) listener(event);
  }

  async function refreshFromDisk(): Promise<void> {
    if (closed) return;
    try {
      const document = await store.load();
      if (document?.checksum === lastChecksum) return;
      lastChecksum = document?.checksum ?? null;
      emit({ kind: "changed", document });
    } catch (error) {
      emit({ kind: "error", error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  const startWatching = async () => {
    await mkdir(options.rootDir, { recursive: true });
    if (closed) return;
    const watcher = watch(options.rootDir, { persistent: false }, (_event, filename) => {
      if (String(filename) !== `${store.projectId}.helix.json`) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshFromDisk(), 25);
    });
    watchers.add(watcher);
  };
  void startWatching().catch((error) => emit({ kind: "error", error }));

  return {
    projectId: store.projectId,
    statePath: store.statePath,
    async load() {
      const document = await store.load();
      lastChecksum = document?.checksum ?? null;
      return document;
    },
    async save(baseChecksum, input) {
      return withLock(async () => {
        const current = await store.load();
        if ((current?.checksum ?? null) !== baseChecksum)
          throw new ProjectStateConflictError(
            "Project state changed in another client; merge before saving.",
            current,
            baseChecksum,
          );
        const saved = await store.save(input);
        lastChecksum = saved.checksum;
        return saved;
      });
    },
    async merge(base, local, remote) {
      remote ??= await store.load();
      if (!remote) throw new Error("Cannot merge against an empty remote project state.");
      return mergeProjectStateDocuments(base, local, remote);
    },
    resolve(merge, choices) {
      if (merge.conflicts.some((conflict) => !choices[conflict.path]))
        throw new Error("Every project-state conflict needs an explicit local or remote choice.");
      const selected = clone(merge.merged) as unknown as Record<string, unknown>;
      for (const conflict of merge.conflicts) {
        const value = choices[conflict.path] === "local" ? conflict.local : conflict.remote;
        const parts = conflict.path.split(/\.|\[|\]/).filter(Boolean);
        setConflictValue(selected, parts, value);
      }
      return inputFromDocument(selected as unknown as ProjectStateDocument);
    },
    subscribe(listener) {
      listeners.add(listener);
      void refreshFromDisk();
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      watchers.clear();
      listeners.clear();
    },
  };
}
