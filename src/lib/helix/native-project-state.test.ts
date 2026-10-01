import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoSession } from "./session.ts";
import { createProjectStateStore } from "./native-project-state.server.ts";

test("native project state saves atomically and rotates verified backups", async () => {
  const root = await mkdtemp(join(tmpdir(), "helix-state-"));
  let clock = 1000;
  const store = createProjectStateStore({
    rootDir: root,
    projectId: "night-shift",
    maxBackups: 2,
    now: () => clock,
  });
  const input = { session: createDemoSession(), operations: [], ledger: [], voiceMacros: [] };
  await store.save(input);
  clock = 2000;
  const changed = createDemoSession();
  changed.playhead = 12;
  await store.save({ ...input, session: changed });
  clock = 3000;
  changed.playhead = 24;
  await store.save({ ...input, session: changed });
  clock = 4000;
  changed.playhead = 36;
  await store.save({ ...input, session: changed });

  const loaded = await store.load();
  assert.equal(loaded?.session.playhead, 36);
  assert.equal((await store.listBackups()).length, 2);
  const restored = await store.restoreBackup((await store.listBackups())[1]);
  assert.equal(restored.session.playhead, 12);
});

test("native project state rejects tampering and recovers a valid interrupted temp", async () => {
  const root = await mkdtemp(join(tmpdir(), "helix-state-"));
  const clock = 1000;
  const store = createProjectStateStore({ rootDir: root, projectId: "recover", now: () => clock });
  const input = { session: createDemoSession(), operations: [], ledger: [], voiceMacros: [] };
  await store.save(input);
  const statePath = join(root, "recover.helix.json");
  const tempPath = `${statePath}.interrupted.tmp`;
  await rename(statePath, tempPath);
  await writeFile(
    `${statePath}.journal`,
    JSON.stringify({ statePath, tempPath, startedAt: clock }),
  );
  assert.equal((await store.load())?.projectId, "recover");
  const tampered = JSON.parse(await readFile(statePath, "utf8")) as {
    session: { playhead: number };
  };
  tampered.session.playhead = 99;
  await writeFile(statePath, JSON.stringify(tampered));
  await assert.rejects(() => store.load(), /integrity/i);
});
