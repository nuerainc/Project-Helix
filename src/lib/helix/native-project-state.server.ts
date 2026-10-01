import { dirname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, copyFile, open, stat } from "node:fs/promises";
import type { LedgerEntry, Operation, SessionState } from "./types.ts";
import type { VoiceMacro } from "./voice-macros.ts";

export const PROJECT_STATE_SCHEMA = "helix.project-state" as const;
export const PROJECT_STATE_VERSION = 1 as const;

export interface ProjectStateDocument {
  schema: typeof PROJECT_STATE_SCHEMA;
  version: typeof PROJECT_STATE_VERSION;
  projectId: string;
  savedAt: number;
  session: SessionState;
  operations: Operation[];
  ledger: LedgerEntry[];
  voiceMacros: VoiceMacro[];
  metadata?: Record<string, string>;
  checksum: string;
}

export type ProjectStateInput = Omit<
  ProjectStateDocument,
  "schema" | "version" | "projectId" | "savedAt" | "checksum"
>;

export interface NativeProjectStateOptions {
  rootDir: string;
  projectId?: string;
  maxBackups?: number;
  now?: () => number;
}

export interface NativeProjectStateStore {
  readonly projectId: string;
  readonly statePath: string;
  save(input: ProjectStateInput): Promise<ProjectStateDocument>;
  load(): Promise<ProjectStateDocument | null>;
  listBackups(): Promise<string[]>;
  restoreBackup(backupName?: string): Promise<ProjectStateDocument>;
  recoverInterrupted(): Promise<boolean>;
  remove(): Promise<void>;
}

function safeProjectId(value: string): string {
  const clean = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (!clean || clean === "." || clean === "..")
    throw new Error("Project ID must contain a safe filename.");
  return clean.slice(0, 96);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checksumFor(value: Omit<ProjectStateDocument, "checksum">): string {
  const payload = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function verifyDocument(document: ProjectStateDocument): void {
  if (document.schema !== PROJECT_STATE_SCHEMA || document.version !== PROJECT_STATE_VERSION)
    throw new Error("Unsupported Helix project-state schema version.");
  const { checksum, ...unsigned } = document;
  if (checksumFor(unsigned) !== checksum)
    throw new Error("Project-state integrity verification failed.");
}

async function readDocument(path: string): Promise<ProjectStateDocument> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as ProjectStateDocument;
  verifyDocument(parsed);
  return parsed;
}

export function createProjectStateStore(
  options: NativeProjectStateOptions,
): NativeProjectStateStore {
  const projectId = safeProjectId(options.projectId ?? "default");
  const rootDir = options.rootDir;
  const statePath = join(rootDir, `${projectId}.helix.json`);
  const journalPath = `${statePath}.journal`;
  const maxBackups = Math.max(1, Math.min(50, options.maxBackups ?? 5));
  const now = options.now ?? Date.now;

  async function atomicWrite(path: string, contents: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${randomUUID()}.tmp`;
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, path);
  }

  async function writeJournal(tempPath: string): Promise<void> {
    await atomicWrite(journalPath, JSON.stringify({ statePath, tempPath, startedAt: now() }));
  }

  async function rotateBackups(): Promise<void> {
    const backups = await listBackups();
    await Promise.all(
      backups.slice(maxBackups).map((name) => rm(join(rootDir, name), { force: true })),
    );
  }

  async function listBackups(): Promise<string[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(rootDir);
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.startsWith(`${projectId}.`) && entry.endsWith(".bak.json"))
      .sort()
      .reverse();
  }

  return {
    projectId,
    statePath,
    async save(input) {
      const documentWithoutChecksum = {
        schema: PROJECT_STATE_SCHEMA,
        version: PROJECT_STATE_VERSION,
        projectId,
        savedAt: now(),
        session: clone(input.session),
        operations: clone(input.operations),
        ledger: clone(input.ledger),
        voiceMacros: clone(input.voiceMacros),
        metadata: input.metadata ? clone(input.metadata) : undefined,
      } satisfies Omit<ProjectStateDocument, "checksum">;
      const document: ProjectStateDocument = {
        ...documentWithoutChecksum,
        checksum: checksumFor(documentWithoutChecksum),
      };
      await mkdir(rootDir, { recursive: true });
      try {
        await stat(statePath);
        await copyFile(statePath, join(rootDir, `${projectId}.${document.savedAt}.bak.json`));
      } catch {
        /* First save has no prior state to rotate. */
      }
      const tempPath = `${statePath}.${randomUUID()}.tmp`;
      await writeJournal(tempPath);
      await atomicWrite(tempPath, `${JSON.stringify(document, null, 2)}\n`);
      await rename(tempPath, statePath);
      await rm(journalPath, { force: true });
      await rotateBackups();
      return clone(document);
    },
    async load() {
      await this.recoverInterrupted();
      try {
        return clone(await readDocument(statePath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    listBackups,
    async restoreBackup(backupName) {
      const name = backupName ?? (await listBackups())[0];
      if (!name || basename(name) !== name || !name.endsWith(".bak.json"))
        throw new Error("Backup file is not valid for this project.");
      const backupPath = join(rootDir, name);
      const backup = await readDocument(backupPath);
      const { checksum: _checksum, ...unsigned } = backup;
      const restored = await this.save(unsigned);
      return restored;
    },
    async recoverInterrupted() {
      try {
        const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
          tempPath?: string;
          statePath?: string;
        };
        if (journal.statePath !== statePath || !journal.tempPath) {
          await rm(journalPath, { force: true });
          return false;
        }
        const recovered = await readDocument(journal.tempPath);
        if (recovered.projectId !== projectId)
          throw new Error("Interrupted state belongs to another project.");
        await rename(journal.tempPath, statePath);
        await rm(journalPath, { force: true });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        await rm(journalPath, { force: true });
        throw error;
      }
    },
    async remove() {
      await rm(statePath, { force: true });
      await rm(journalPath, { force: true });
      await Promise.all(
        (await listBackups()).map((name) => rm(join(rootDir, name), { force: true })),
      );
    },
  };
}
