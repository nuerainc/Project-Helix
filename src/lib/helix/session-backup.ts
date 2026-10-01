import type { SessionState } from "./types.ts";

export const SESSION_BACKUP_SCHEMA = "helix.session-backup" as const;
export const SESSION_BACKUP_VERSION = 1 as const;

export interface SessionBackup {
  id: string;
  label: string;
  createdAt: number;
  schema: typeof SESSION_BACKUP_SCHEMA;
  version: typeof SESSION_BACKUP_VERSION;
  session: SessionState;
  checksum: string;
}

export interface BackupStorage {
  list(): SessionBackup[];
  save(backup: SessionBackup): void;
  remove(id: string): void;
}

const STORAGE_KEY = "helix.session.backups.v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checksumFor(session: SessionState): string {
  const payload = JSON.stringify(session);
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSessionBackup(
  session: SessionState,
  label = "Voice checkpoint",
  now = Date.now(),
): SessionBackup {
  const snapshot = clone(session);
  return {
    id: `backup_${now}_${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim() || "Voice checkpoint",
    createdAt: now,
    schema: SESSION_BACKUP_SCHEMA,
    version: SESSION_BACKUP_VERSION,
    session: snapshot,
    checksum: checksumFor(snapshot),
  };
}

export function verifySessionBackup(
  backup: SessionBackup,
): { ok: true } | { ok: false; reason: string } {
  if (backup.schema !== SESSION_BACKUP_SCHEMA || backup.version !== SESSION_BACKUP_VERSION)
    return { ok: false, reason: "Unsupported Helix session backup schema." };
  const expected = checksumFor(backup.session);
  return expected === backup.checksum
    ? { ok: true }
    : { ok: false, reason: "Backup integrity check failed; the snapshot was not restored." };
}

export function createMemoryBackupStorage(seed: SessionBackup[] = []): BackupStorage {
  let records = seed.map(clone).sort((a, b) => b.createdAt - a.createdAt);
  return {
    list: () => records.map(clone),
    save: (backup) => {
      records = [backup, ...records.filter((record) => record.id !== backup.id)].sort(
        (a, b) => b.createdAt - a.createdAt,
      );
    },
    remove: (id) => {
      records = records.filter((record) => record.id !== id);
    },
  };
}

export function createBrowserBackupStorage(): BackupStorage {
  if (typeof window === "undefined" || !window.localStorage) return createMemoryBackupStorage();
  const read = (): SessionBackup[] => {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "[]",
      ) as SessionBackup[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (records: SessionBackup[]) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  };
  return {
    list: () => read().sort((a, b) => b.createdAt - a.createdAt),
    save: (backup) => write([backup, ...read().filter((record) => record.id !== backup.id)]),
    remove: (id) => write(read().filter((record) => record.id !== id)),
  };
}
