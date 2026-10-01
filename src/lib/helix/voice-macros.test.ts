import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryVoiceMacroStorage,
  createVoiceMacro,
  expandVoiceMacro,
} from "./voice-macros.ts";

test("voice macros expand triggers and positional arguments", () => {
  const macro = createVoiceMacro("Vocal lift", "vocal lift", "turn lead vocal up $1 dB", 100);
  assert.deepEqual(expandVoiceMacro("vocal lift 2", [macro]), {
    text: "turn lead vocal up 2 dB",
    macro,
  });
});

test("macro storage persists updates and removes aliases", () => {
  const storage = createMemoryVoiceMacroStorage();
  const macro = createVoiceMacro("Print check", "print check", "inspect session", 100);
  storage.save(macro);
  assert.equal(storage.list()[0]?.name, "Print check");
  storage.remove(macro.id);
  assert.equal(storage.list().length, 0);
});
