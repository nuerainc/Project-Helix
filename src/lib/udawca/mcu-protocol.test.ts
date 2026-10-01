import test from "node:test";
import assert from "node:assert/strict";
import {
  MCU,
  decodeMcuMessage,
  encodeMcuButtonPress,
  encodeMcuFaderGesture,
} from "./mcu-protocol.ts";

test("encodes MCU mute as a note-on press and release", () => {
  assert.deepEqual(encodeMcuButtonPress(MCU.notes.mute1), [
    [0x90, 0x10, 0x7f],
    [0x90, 0x10, 0],
  ]);
});

test("encodes MCU fader touch and 14-bit pitch bend", () => {
  assert.deepEqual(encodeMcuFaderGesture(2, 0x1234), [
    [0x92, 106, 0x7f],
    [0xe2, 0x34, 0x24],
    [0x92, 106, 0],
  ]);
});

test("decodes MCU channel buttons, fader touch, and pitch bend", () => {
  assert.deepEqual(decodeMcuMessage([0x90, MCU.notes.solo1 + 3, 0x7f]), {
    kind: "button",
    note: 11,
    down: true,
    control: "solo",
  });
  assert.deepEqual(decodeMcuMessage([0x92, 106, 0]), {
    kind: "fader_touch",
    zone: 2,
    down: false,
  });
  assert.deepEqual(decodeMcuMessage([0xe2, 0x34, 0x24]), {
    kind: "fader",
    zone: 2,
    value14: 0x1234,
  });
});

test("maps MCU transport and banking to the researched note range", () => {
  const play = decodeMcuMessage([0x90, MCU.notes.play, 0x7f]);
  const bankRight = decodeMcuMessage([0x90, MCU.notes.bankRight, 0x7f]);
  assert.equal(play.kind, "button");
  assert.equal(bankRight.kind, "button");
  if (play.kind === "button") assert.equal(play.control, "play");
  if (bankRight.kind === "button") assert.equal(bankRight.control, "bank_right");
});
