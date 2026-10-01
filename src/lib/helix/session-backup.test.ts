import test from "node:test";
import assert from "node:assert/strict";
import { createDemoSession } from "./session.ts";
import {
  createMemoryBackupStorage,
  createSessionBackup,
  verifySessionBackup,
} from "./session-backup.ts";

test("session backups are versioned, cloned, ordered, and integrity-verifiable", () => {
  const session = createDemoSession();
  const storage = createMemoryBackupStorage();
  const first = createSessionBackup(session, "Before vocal routing", 100);
  session.playhead = 42;
  const second = createSessionBackup(session, "After vocal routing", 200);
  storage.save(first);
  storage.save(second);

  assert.deepEqual(
    storage.list().map((backup) => backup.label),
    ["After vocal routing", "Before vocal routing"],
  );
  assert.deepEqual(verifySessionBackup(first), { ok: true });
  assert.deepEqual(first.session.playhead, 0);
  assert.deepEqual(second.session.playhead, 42);
});

test("tampered backups are rejected before restore", () => {
  const backup = createSessionBackup(createDemoSession(), "Safe point", 100);
  backup.session.playhead = 99;
  const result = verifySessionBackup(backup);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /integrity/i);
});
