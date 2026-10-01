import test from "node:test";
import assert from "node:assert/strict";
import {
  HUI,
  HuiDecoder,
  encodeHuiButtonPress,
  encodeHuiFaderGesture,
  encodeHuiPing,
  encodeHuiRelativeKnob,
  encodeHuiSendMode,
} from "./hui-protocol.ts";

test("encodes a HUI mute press as zone select plus button down/up", () => {
  assert.deepEqual(encodeHuiButtonPress(2), [
    [0xb0, 0x0c, 0],
    [0xb0, 0x2c, 0x42],
    [0xb0, 0x0c, 0],
    [0xb0, 0x2c, 0x02],
  ]);
});

test("encodes a 14-bit fader gesture with touch, high/low bytes, and release", () => {
  assert.deepEqual(encodeHuiFaderGesture(3, 0x1234), [
    [0xb0, 0x0f, 3],
    [0xb0, 0x2f, 0x40],
    [0xb0, 0x03, 0x24],
    [0xb0, 0x23, 0x34],
    [0xb0, 0x0f, 3],
    [0xb0, 0x2f, 0],
  ]);
});

test("decodes selected-zone button and paired fader bytes", () => {
  const decoder = new HuiDecoder();
  decoder.decode([0xb0, 0x0c, 2]);
  assert.deepEqual(decoder.decode([0xb0, 0x2c, 0x42]), {
    kind: "button",
    zone: 2,
    port: 2,
    down: true,
  });
  decoder.decode([0xb0, 0x0f, 3]);
  assert.deepEqual(decoder.decode([0xb0, 0x2f, 0x40]), {
    kind: "fader_touch",
    zone: 3,
    down: true,
  });
  decoder.decode([0xb0, 0x03, 0x24]);
  assert.deepEqual(decoder.decode([0xb0, 0x23, 0x34]), { kind: "fader", zone: 3, value14: 0x1234 });
});

test("encodes the one-second HUI keepalive ping", () => {
  assert.deepEqual(encodeHuiPing(), [0x90, 0, 0]);
  assert.equal(HUI.channel, 0);
});

test("encodes Send B mode and a relative send-level knob move", () => {
  assert.deepEqual(encodeHuiSendMode(1), [
    [0xb0, 0x0c, 11],
    [0xb0, 0x2c, 0x46],
    [0xb0, 0x0c, 11],
    [0xb0, 0x2c, 0x06],
  ]);
  assert.deepEqual(encodeHuiRelativeKnob(2, 4), [0xb0, 0x42, 0x44]);
});

test("decodes HUI meter and send knob feedback", () => {
  const decoder = new HuiDecoder();
  assert.deepEqual(decoder.decode([0xa0, 3, 0x0c]), {
    kind: "meter",
    zone: 3,
    side: "left",
    value: 12,
  });
  assert.deepEqual(decoder.decode([0xa0, 3, 0x1a]), {
    kind: "meter",
    zone: 3,
    side: "right",
    value: 10,
  });
  assert.deepEqual(decoder.decode([0xb0, 0x12, 0x55]), {
    kind: "knob_feedback",
    zone: 2,
    value: 0x55,
  });
});
