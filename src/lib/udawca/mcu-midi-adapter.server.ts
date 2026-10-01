import type { Change, Operation, SessionState } from "../helix/types.ts";
import { cloneSession, createDemoSession, findTrack } from "../helix/session.ts";
import { hostById } from "../helix/hosts.ts";
import type {
  AdapterDescriptor,
  AdapterExecutionResult,
  AdapterHealth,
  AdapterVerificationResult,
  HelixAdapter,
} from "./adapter.ts";
import { createNodeMidiPort, type NativeMidiPort } from "./native-midi.server.ts";
import {
  MCU,
  decodeMcuMessage,
  encodeMcuButtonPress,
  encodeMcuFaderGesture,
  type MidiMessage,
} from "./mcu-protocol.ts";

export interface McuConfig {
  inputPort: string;
  outputPort: string;
  staleAfterMs?: number;
  bankOffset?: number;
}

export interface McuAdapter extends HelixAdapter {
  readonly config: Required<McuConfig>;
  bank(delta: -1 | 1): void;
}

const descriptor: AdapterDescriptor = {
  id: "mackie-mcu-native",
  label: "Mackie Control Universal · native MIDI",
  version: "0.4.0-dev",
  host: "protools",
  protocol: "MCU",
  platforms: ["windows", "macos", "linux"],
};

export function createMcuAdapter(
  config: McuConfig,
  port: NativeMidiPort,
  initial: SessionState = createDemoSession(),
): McuAdapter {
  const settings = { staleAfterMs: 0, bankOffset: 0, ...config };
  const caps = hostById("protools");
  let state: AdapterHealth["state"] = "disconnected";
  let permission: AdapterHealth["permission"] = "unknown";
  const session = cloneSession(initial);
  let lastSeenAt: number | undefined;
  let lastError: string | undefined;

  function health(): AdapterHealth {
    const stale =
      state === "connected" &&
      settings.staleAfterMs > 0 &&
      lastSeenAt !== undefined &&
      Date.now() - lastSeenAt > settings.staleAfterMs;
    const effectiveState = stale ? "stale" : state;
    return {
      state: effectiveState,
      permission,
      lastSeenAt,
      staleAfterMs: settings.staleAfterMs,
      message:
        lastError ??
        (effectiveState === "connected"
          ? `MCU connected to ${settings.inputPort} ↔ ${settings.outputPort}.`
          : effectiveState === "stale"
            ? "MCU input has gone stale; reconnect before committing more work."
            : "Native MCU adapter is disconnected."),
    };
  }

  function sendAll(messages: MidiMessage[]): void {
    for (const message of messages) port.send(message);
  }

  function onMessage(message: number[]): void {
    lastSeenAt = Date.now();
    const event = decodeMcuMessage(message);
    if (event.kind === "fader") {
      const track = session.tracks[settings.bankOffset + event.zone];
      if (track) track.volumeDb = (event.value14 / 16383) * 72 - 60;
    }
    if (event.kind === "button" && event.down && event.control !== "unknown") {
      const zone =
        event.control === "mute" ||
        event.control === "solo" ||
        event.control === "arm" ||
        event.control === "select"
          ? event.note % 8
          : undefined;
      const track = zone === undefined ? undefined : session.tracks[settings.bankOffset + zone];
      if (track && event.control === "mute") track.mute = !track.mute;
      if (track && event.control === "solo") track.solo = !track.solo;
      if (track && event.control === "arm") track.arm = !track.arm;
      if (event.control === "play") session.playing = true;
      if (event.control === "stop") session.playing = false;
      if (event.control === "rewind") session.playhead = Math.max(0, session.playhead - 1);
      if (event.control === "fast_forward") session.playhead += 1;
      if (event.control === "bank_left") settings.bankOffset = Math.max(0, settings.bankOffset - 8);
      if (event.control === "bank_right") settings.bankOffset += 8;
    }
  }

  function connect(): Promise<AdapterHealth> {
    try {
      lastError = undefined;
      port.open(settings.inputPort, settings.outputPort, onMessage, (error) => {
        lastError = error.message;
        state = "error";
      });
      state = "connected";
      permission = "granted";
      lastSeenAt = Date.now();
      return Promise.resolve(health());
    } catch (error) {
      state = "error";
      permission = "unknown";
      lastError = error instanceof Error ? error.message : String(error);
      return Promise.reject(new Error(lastError));
    }
  }

  function trackZone(trackId: string): number | undefined {
    const index = session.tracks.findIndex((track) => track.id === trackId);
    const zone = index - settings.bankOffset;
    return zone >= 0 && zone < 8 ? zone : undefined;
  }

  function changeMessages(change: Change): MidiMessage[] | undefined {
    if (change.kind === "transport") {
      const note = {
        rewind: MCU.notes.rewind,
        fast_forward: MCU.notes.fastForward,
        stop: MCU.notes.stop,
        play: MCU.notes.play,
        record: MCU.notes.record,
        return: undefined,
      }[change.command];
      return note === undefined ? undefined : encodeMcuButtonPress(note);
    }
    const zone = trackZone(change.trackId);
    if (zone === undefined) return undefined;
    if (change.kind === "mute") return encodeMcuButtonPress(MCU.notes.mute1 + zone);
    if (change.kind === "solo") return encodeMcuButtonPress(MCU.notes.solo1 + zone);
    if (change.kind === "arm") return encodeMcuButtonPress(MCU.notes.rec1 + zone);
    if (change.kind === "volume") {
      const track = findTrack(session, change.trackId);
      const db = change.absDb ?? (track?.volumeDb ?? 0) + (change.deltaDb ?? 0);
      return encodeMcuFaderGesture(zone, fader14FromNormalized(normalizedFromDb(db)));
    }
    return undefined;
  }

  function applyOptimistic(change: Change): void {
    if (change.kind === "transport") {
      if (change.command === "play") session.playing = true;
      if (change.command === "stop") session.playing = false;
      if (change.command === "return") session.playhead = 0;
      return;
    }
    const track = findTrack(session, change.trackId);
    if (!track) return;
    if (change.kind === "mute" || change.kind === "solo" || change.kind === "arm")
      track[change.kind] = change.enabled;
    if (change.kind === "volume")
      track.volumeDb = change.absDb ?? track.volumeDb + (change.deltaDb ?? 0);
  }

  return {
    descriptor,
    config: settings,
    discover: async () => caps,
    connect,
    health,
    snapshot: async () => {
      if (health().state !== "connected") throw new Error("MCU adapter is not connected.");
      return cloneSession(session);
    },
    execute: async (operation, signal): Promise<AdapterExecutionResult> => {
      if (signal?.aborted) return cancelled(operation);
      if (health().state !== "connected")
        return refused(operation, "MCU adapter is not connected or has gone stale.");
      if (operation.refusedReason) return refused(operation, operation.refusedReason);
      const supported = operation.changes.filter((change) => changeMessages(change));
      const unsupported = operation.changes.length - supported.length;
      if (!supported.length)
        return refused(
          operation,
          "MCU exposes surface-level control only; no executable mapping exists.",
        );
      for (const change of supported) {
        sendAll(changeMessages(change) ?? []);
        applyOptimistic(change);
      }
      lastSeenAt = Date.now();
      return {
        operationId: operation.id,
        status: unsupported ? "partial" : "committed",
        completedChanges: supported.length,
        totalChanges: operation.changes.length,
        message: unsupported
          ? `${supported.length} MCU change(s) sent; ${unsupported} change(s) remain human-assisted.`
          : "MCU messages sent to the configured ports; verification awaits surface feedback.",
      };
    },
    verify: async (operation, signal): Promise<AdapterVerificationResult> => {
      if (signal?.aborted || health().state !== "connected") {
        return {
          operationId: operation.id,
          status: "not_observable",
          verifyClass: operation.verifyClass,
          observed: "MCU input is not connected or has gone stale.",
        };
      }
      return {
        operationId: operation.id,
        status: "pass",
        verifyClass: operation.verifyClass,
        observed: "MCU transport is connected; exact host state remains coarse for this protocol.",
      };
    },
    bank: (delta) => {
      const note = delta < 0 ? MCU.notes.bankLeft : MCU.notes.bankRight;
      if (health().state === "connected") sendAll(encodeMcuButtonPress(note));
      settings.bankOffset = Math.max(0, settings.bankOffset + delta * 8);
      lastSeenAt = Date.now();
    },
    disconnect: async () => {
      port.close();
      state = "disconnected";
      permission = "unknown";
    },
  };
}

export async function createNodeMcuAdapter(
  config: McuConfig,
  initial?: SessionState,
): Promise<McuAdapter> {
  return createMcuAdapter(config, await createNodeMidiPort(), initial);
}

function fader14FromNormalized(normalized: number): number {
  return Math.max(0, Math.min(16383, Math.round(Math.max(0, Math.min(1, normalized)) * 16383)));
}

function normalizedFromDb(db: number): number {
  return Math.max(0, Math.min(1, (db + 60) / 72));
}

function refused(operation: Operation, message: string): AdapterExecutionResult {
  return {
    operationId: operation.id,
    status: "refused",
    completedChanges: 0,
    totalChanges: operation.changes.length,
    message,
  };
}

function cancelled(operation: Operation): AdapterExecutionResult {
  return {
    operationId: operation.id,
    status: "cancelled",
    completedChanges: 0,
    totalChanges: operation.changes.length,
    message: "Execution cancelled before MCU dispatch.",
  };
}
