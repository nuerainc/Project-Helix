export type MidiMessage = readonly [status: number, data1: number, data2: number];

export type McuInputEvent =
  | { kind: "button"; note: number; down: boolean; control: McuControl }
  | { kind: "fader"; zone: number; value14: number }
  | { kind: "fader_touch"; zone: number; down: boolean }
  | { kind: "unknown"; message: MidiMessage };

export type McuControl =
  | "mute"
  | "solo"
  | "arm"
  | "select"
  | "bank_left"
  | "bank_right"
  | "channel_left"
  | "channel_right"
  | "rewind"
  | "fast_forward"
  | "stop"
  | "play"
  | "record"
  | "unknown";

export const MCU = {
  channel: 0,
  notes: {
    rec1: 0,
    solo1: 8,
    mute1: 16,
    select1: 24,
    bankLeft: 46,
    bankRight: 47,
    channelLeft: 48,
    channelRight: 49,
    rewind: 91,
    fastForward: 92,
    stop: 93,
    play: 94,
    record: 95,
    faderTouch1: 104,
    masterFaderTouch: 112,
  },
} as const;

const NOTE_ON_STATUS = 0x90 | MCU.channel;

export function encodeMcuButton(note: number, down: boolean): MidiMessage {
  assertNote(note);
  return [NOTE_ON_STATUS, note, down ? 0x7f : 0];
}

export function encodeMcuButtonPress(note: number): MidiMessage[] {
  return [encodeMcuButton(note, true), encodeMcuButton(note, false)];
}

export function encodeMcuFader(zone: number, value14: number): MidiMessage {
  assertFaderZone(zone);
  const value = clamp14(value14);
  return [0xe0 | zone, value & 0x7f, (value >> 7) & 0x7f];
}

export function encodeMcuFaderTouch(zone: number, down: boolean): MidiMessage {
  assertFaderZone(zone);
  const channel = zone;
  const note = MCU.notes.faderTouch1 + zone;
  return [0x90 | channel, note, down ? 0x7f : 0];
}

export function encodeMcuFaderGesture(zone: number, value14: number): MidiMessage[] {
  return [
    encodeMcuFaderTouch(zone, true),
    encodeMcuFader(zone, value14),
    encodeMcuFaderTouch(zone, false),
  ];
}

export function decodeMcuMessage(message: readonly number[]): McuInputEvent {
  if (message.length < 3)
    return { kind: "unknown", message: [message[0] ?? 0, message[1] ?? 0, message[2] ?? 0] };
  const [status, data1, data2] = message;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0xe0 && channel <= 8) {
    return { kind: "fader", zone: channel, value14: ((data2 & 0x7f) << 7) | (data1 & 0x7f) };
  }
  if (type === 0x90 && channel <= 8) {
    if (data1 >= MCU.notes.faderTouch1 && data1 <= MCU.notes.masterFaderTouch) {
      return { kind: "fader_touch", zone: data1 - MCU.notes.faderTouch1, down: data2 > 0 };
    }
    return {
      kind: "button",
      note: data1,
      down: data2 > 0,
      control: controlForNote(data1),
    };
  }
  return { kind: "unknown", message: [status, data1, data2] };
}

export function mcuFaderNote(zone: number): number {
  assertFaderZone(zone);
  return MCU.notes.faderTouch1 + zone;
}

function controlForNote(note: number): McuControl {
  if (note >= MCU.notes.mute1 && note < MCU.notes.mute1 + 8) return "mute";
  if (note >= MCU.notes.solo1 && note < MCU.notes.solo1 + 8) return "solo";
  if (note >= MCU.notes.rec1 && note < MCU.notes.rec1 + 8) return "arm";
  if (note >= MCU.notes.select1 && note < MCU.notes.select1 + 8) return "select";
  if (note === MCU.notes.bankLeft) return "bank_left";
  if (note === MCU.notes.bankRight) return "bank_right";
  if (note === MCU.notes.channelLeft) return "channel_left";
  if (note === MCU.notes.channelRight) return "channel_right";
  if (note === MCU.notes.rewind) return "rewind";
  if (note === MCU.notes.fastForward) return "fast_forward";
  if (note === MCU.notes.stop) return "stop";
  if (note === MCU.notes.play) return "play";
  if (note === MCU.notes.record) return "record";
  return "unknown";
}

function assertFaderZone(zone: number): void {
  if (!Number.isInteger(zone) || zone < 0 || zone > 8)
    throw new RangeError("MCU fader zone must be 0 through 8.");
}

function assertNote(note: number): void {
  if (!Number.isInteger(note) || note < 0 || note > 127)
    throw new RangeError("MCU note must be between 0 and 127.");
}

function clamp14(value: number): number {
  return Math.max(0, Math.min(16383, Math.round(value)));
}
