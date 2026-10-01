import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoSession } from "./session.ts";
import { createProjectStateStore } from "./native-project-state.server.ts";
import {
  createSynchronizedProjectStateStore,
  mergeProjectStateDocuments,
  ProjectStateConflictError,
} from "./native-project-sync.server.ts";

function input() {
  return { session: createDemoSession(), operations: [], ledger: [], voiceMacros: [] };
}

test("three-way merge keeps independent client edits and reports scalar conflicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "helix-sync-"));
  const store = createProjectStateStore({ rootDir: root, projectId: "merge" });
  const base = await store.save(input());
  const localSession = createDemoSession();
  localSession.playhead = 12;
  const remoteSession = createDemoSession();
  remoteSession.playhead = 24;
  const local = await store.save({ ...input(), session: localSession });
  const remote = await store.save({ ...input(), session: remoteSession });

  const result = mergeProjectStateDocuments(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, "session.playhead");
  assert.equal(result.merged.session.playhead, 24);
});

test("synchronized stores reject stale writes and expose ID-keyed conflict choices", async () => {
  const root = await mkdtemp(join(tmpdir(), "helix-sync-"));
  const first = createSynchronizedProjectStateStore({ rootDir: root, projectId: "clients" });
  const second = createSynchronizedProjectStateStore({ rootDir: root, projectId: "clients" });
  const initial = await first.save(null, input());
  const secondBase = await second.load();
  assert.ok(secondBase);

  const changed = createDemoSession();
  changed.playhead = 10;
  const latest = await first.save(initial.checksum, { ...input(), session: changed });
  await assert.rejects(
    () => second.save(secondBase!.checksum, { ...input(), session: createDemoSession() }),
    (error: unknown) =>
      error instanceof ProjectStateConflictError && error.current?.checksum === latest.checksum,
  );

  first.close();
  second.close();
});

test("synchronized stores publish external state changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "helix-sync-"));
  const writer = createProjectStateStore({ rootDir: root, projectId: "watch" });
  const reader = createSynchronizedProjectStateStore({ rootDir: root, projectId: "watch" });
  const first = await writer.save(input());
  await reader.load();
  const changed = createDemoSession();
  changed.playhead = 18;
  const changedDocument = await writer.save({ ...input(), session: changed });

  const event = await new Promise<"changed" | "error">((resolve) => {
    const unsubscribe = reader.subscribe((update) => {
      if (update.kind === "changed" && update.document?.checksum === changedDocument.checksum) {
        unsubscribe();
        resolve(update.kind);
      } else if (update.kind === "error") {
        unsubscribe();
        resolve(update.kind);
      }
    });
    setTimeout(() => {
      unsubscribe();
      resolve("error");
    }, 1500).unref();
  });
  assert.equal(event, "changed");
  assert.notEqual(first.checksum, changedDocument.checksum);
  reader.close();
});
