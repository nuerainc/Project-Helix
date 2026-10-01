export type MidiMessage = readonly [status: number, data1: number, data2: number];

export type HuiButtonId =
  | "mute"
  | "solo"
  | "arm"
  | "select"
  | "bank_left"
  | "bank_right"
  | "channel_left"
  | "channel_right"
  | "play"
  | "stop"
  | "return_to_zero"
  | "record"
  | "rewind"
  | "fast_forward"
  | "send_a"
  | "send_b"
  | "send_c"
  | "send_d"
  | "send_e";

export type HuiInputEvent =
  | { kind: "button"; zone: number; port: number; down: boolean }
  | { kind: "fader"; zone: number; value14: number }
  | { kind: "fader_touch"; zone: number; down: boolean }
  | { kind: "knob"; zone: number; delta: number }
  | { kind: "knob_feedback"; zone: number; value: number }
  | { kind: "meter"; zone: number; side: "left" | "right"; value: number }
  | { kind: "unknown"; message: MidiMessage };

export interface HuiDecodeState {
  buttonZone: number;
  touchZone: number;
  faderHigh: number[];
}

export const HUI = {
  channel: 0,
  cc: {
    faderHigh: 0x00,
    faderLow: 0x20,
    zoneSelect: 0x0c,
    faderTouchZone: 0x0f,
    button: 0x2c,
    faderTouch: 0x2f,
  },
  button: {
    fader: 0,
    select: 1,
    mute: 2,
    solo: 3,
    arm: 7,
    channelLeft: 80,
    bankLeft: 81,
    channelRight: 82,
    bankRight: 83,
    rewind: 113,
    fastForward: 114,
    stop: 115,
    play: 116,
    record: 117,
    returnToZero: 120,
    sendA: 95,
    sendB: 94,
    sendC: 93,
    sendD: 92,
    sendE: 91,
  },
  ccKnobInput: 0x40,
  ccKnobFeedback: 0x10,
} as const;

const CC_STATUS = 0xb0 | HUI.channel;
const NOTE_ON_STATUS = 0x90 | HUI.channel;

export function encodeHuiButton(cc: number, down: boolean): MidiMessage[] {
  if (!Number.isInteger(cc) || cc < 0 || cc > 255)
    throw new RangeError("HUI button CC must be between 0 and 255.");
  const zone = Math.floor(cc / 8);
  const port = cc % 8;
  return [
    [CC_STATUS, HUI.cc.zoneSelect, zone],
    [CC_STATUS, HUI.cc.button, (down ? 0x40 : 0) | port],
  ];
}

export function encodeHuiButtonPress(cc: number): MidiMessage[] {
  return [...encodeHuiButton(cc, true), ...encodeHuiButton(cc, false)];
}

export function encodeHuiFader(zone: number, value14: number): MidiMessage[] {
  assertFaderZone(zone);
  const value = clamp14(value14);
  const high = (value >> 7) & 0x7f;
  const low = value & 0x7f;
  return [
    [CC_STATUS, HUI.cc.faderHigh + zone, high],
    [CC_STATUS, HUI.cc.faderLow + zone, low],
  ];
}

export function encodeHuiFaderTouch(zone: number, down: boolean): MidiMessage[] {
  assertFaderZone(zone);
  return [
    [CC_STATUS, HUI.cc.faderTouchZone, zone],
    [CC_STATUS, HUI.cc.faderTouch, down ? 0x40 : 0],
  ];
}

export function encodeHuiFaderGesture(zone: number, value14: number): MidiMessage[] {
  return [
    ...encodeHuiFaderTouch(zone, true),
    ...encodeHuiFader(zone, value14),
    ...encodeHuiFaderTouch(zone, false),
  ];
}

export function encodeHuiSendMode(sendIndex: number): MidiMessage[] {
  if (!Number.isInteger(sendIndex) || sendIndex < 0 || sendIndex > 4)
    throw new RangeError("HUI send index must be 0 through 4.");
  return encodeHuiButtonPress(HUI.button.sendA - sendIndex);
}

export function encodeHuiRelativeKnob(zone: number, delta: number): MidiMessage {
  if (!Number.isInteger(zone) || zone < 0 || zone > 7)
    throw new RangeError("HUI knob zone must be 0 through 7.");
  const steps = Math.max(-63, Math.min(63, Math.round(delta)));
  return [CC_STATUS, HUI.ccKnobInput + zone, 0x40 + steps];
}

export function encodeHuiPing(): MidiMessage {
  return [NOTE_ON_STATUS, 0, 0];
}

export class HuiDecoder {
  readonly state: HuiDecodeState = { buttonZone: 0, touchZone: 0, faderHigh: [] };

  decode(message: readonly number[]): HuiInputEvent {
    return decodeHuiMessage(message, this.state);
  }
}

export function decodeHuiMessage(message: readonly number[], state: HuiDecodeState): HuiInputEvent {
  if (message.length < 3)
    return { kind: "unknown", message: [message[0] ?? 0, message[1] ?? 0, message[2] ?? 0] };
  const [status, data1, data2] = message;
  if ((status & 0xf0) === 0xa0 && (status & 0x0f) === HUI.channel) {
    const side = data2 >= 0x10 ? "right" : "left";
    const raw = side === "right" ? data2 - 0x10 : data2;
    return { kind: "meter", zone: data1 & 0x07, side, value: Math.max(0, Math.min(15, raw)) };
  }
  if ((status & 0xf0) !== 0xb0 || (status & 0x0f) !== HUI.channel) {
    return { kind: "unknown", message: [status, data1, data2] };
  }
  if (data1 === HUI.cc.zoneSelect) {
    state.buttonZone = data2 & 0x7f;
    return { kind: "unknown", message: [status, data1, data2] };
  }
  if (data1 === HUI.cc.faderTouchZone) {
    state.touchZone = data2 & 0x07;
    return { kind: "unknown", message: [status, data1, data2] };
  }
  if (data1 >= HUI.cc.faderHigh && data1 <= HUI.cc.faderHigh + 8) {
    const zone = data1 - HUI.cc.faderHigh;
    state.faderHigh[zone] = data2 & 0x7f;
    return { kind: "fader", zone, value14: state.faderHigh[zone] << 7 };
  }
  if (data1 >= HUI.cc.faderLow && data1 <= HUI.cc.faderLow + 8) {
    const zone = data1 - HUI.cc.faderLow;
    return { kind: "fader", zone, value14: ((state.faderHigh[zone] ?? 0) << 7) | (data2 & 0x7f) };
  }
  if (data1 === HUI.cc.faderTouch) {
    return { kind: "fader_touch", zone: state.touchZone, down: data2 >= 0x40 };
  }
  if (data1 === HUI.cc.button) {
    return { kind: "button", zone: state.buttonZone, port: data2 & 0x07, down: data2 >= 0x40 };
  }
  if (data1 >= HUI.ccKnobInput && data1 < HUI.ccKnobInput + 8) {
    return { kind: "knob", zone: data1 - HUI.ccKnobInput, delta: (data2 & 0x7f) - 0x40 };
  }
  if (data1 >= HUI.ccKnobFeedback && data1 < HUI.ccKnobFeedback + 8) {
    return { kind: "knob_feedback", zone: data1 - HUI.ccKnobFeedback, value: data2 & 0x7f };
  }
  return { kind: "unknown", message: [status, data1, data2] };
}

export function fader14FromNormalized(normalized: number): number {
  return clamp14(Math.round(Math.max(0, Math.min(1, normalized)) * 16383));
}

export function normalizedFromDb(db: number): number {
  // HUI exposes a 14-bit position, but its fader-to-dB curve is host/device
  // dependent. This bounded curve is intentionally reported as COARSE.
  return Math.max(0, Math.min(1, (db + 60) / 72));
}

function assertFaderZone(zone: number): void {
  if (!Number.isInteger(zone) || zone < 0 || zone > 8)
    throw new RangeError("HUI fader zone must be 0 through 8.");
}

function clamp14(value: number): number {
  return Math.max(0, Math.min(16383, Math.round(value)));
}
