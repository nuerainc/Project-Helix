import type { Change, Operation, SessionState } from "../helix/types.ts";
import { cloneSession, createDemoSession, findTrack } from "../helix/session.ts";
import { hostById } from "../helix/hosts.ts";
import {
  HUI,
  HuiDecoder,
  encodeHuiButtonPress,
  encodeHuiFaderGesture,
  encodeHuiPing,
  encodeHuiRelativeKnob,
  encodeHuiSendMode,
  fader14FromNormalized,
  normalizedFromDb,
  type MidiMessage,
} from "./hui-protocol.ts";
import type {
  AdapterDescriptor,
  AdapterExecutionResult,
  AdapterHealth,
  AdapterVerificationResult,
  HelixAdapter,
} from "./adapter.ts";
import { createNodeMidiPort, type NativeMidiPort } from "./native-midi.server.ts";

export type HuiMidiPort = NativeMidiPort;
export { createNodeMidiPort as createNodeHuiMidiPort } from "./native-midi.server.ts";

export interface ProToolsHuiConfig {
  inputPort: string;
  outputPort: string;
  pingIntervalMs?: number;
  staleAfterMs?: number;
  bankOffset?: number;
  sendStepDb?: number;
  onFeedback?: (session: SessionState) => void;
}

export interface ProToolsHuiAdapter extends HelixAdapter {
  readonly config: ProToolsHuiConfig & {
    pingIntervalMs: number;
    staleAfterMs: number;
    bankOffset: number;
    sendStepDb: number;
  };
  bank(delta: -1 | 1): void;
}

const descriptor: AdapterDescriptor = {
  id: "protools-hui-native",
  label: "Pro Tools · native HUI",
  version: "0.4.0-dev",
  host: "protools",
  protocol: "HUI",
  platforms: ["windows", "macos", "linux"],
};

export function createProToolsHuiAdapter(
  config: ProToolsHuiConfig,
  port: HuiMidiPort,
  initial: SessionState = createDemoSession(),
): ProToolsHuiAdapter {
  const settings = {
    pingIntervalMs: 1_000,
    staleAfterMs: 2_000,
    bankOffset: 0,
    sendStepDb: 0.5,
    onFeedback: undefined,
    ...config,
  };
  const caps = hostById("protools");
  const decoder = new HuiDecoder();
  let state: AdapterHealth["state"] = "disconnected";
  let permission: AdapterHealth["permission"] = "unknown";
  const session = cloneSession(initial);
  let lastSeenAt: number | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let lastError: string | undefined;
  let activeSendIndex = 0;

  function health(): AdapterHealth {
    const stale =
      state === "connected" &&
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
          ? `HUI connected to ${settings.inputPort} ↔ ${settings.outputPort}.`
          : effectiveState === "stale"
            ? "HUI input has gone stale; reconnect before committing more work."
            : "Native HUI adapter is disconnected."),
    };
  }

  function sendAll(messages: MidiMessage[]): void {
    for (const message of messages) port.send(message);
  }

  function onMessage(message: number[]): void {
    lastSeenAt = Date.now();
    const event = decoder.decode(message);
    if (event.kind === "fader") {
      const track = session.tracks[settings.bankOffset + event.zone];
      if (track) {
        track.volumeDb = (event.value14 / 16383) * 72 - 60;
        track.feedbackAt = Date.now();
      }
    }
    if (event.kind === "meter") {
      const track = session.tracks[settings.bankOffset + event.zone];
      if (track) {
        const db = -60 + (event.value / 15) * 60;
        if (event.side === "left") track.meterLeftDb = db;
        else track.meterRightDb = db;
        track.feedbackAt = Date.now();
      }
    }
    if (event.kind === "knob_feedback") {
      const track = session.tracks[settings.bankOffset + event.zone];
      const send = track?.sends[activeSendIndex];
      if (send) {
        send.db = -60 + (event.value / 127) * 72;
        track.feedbackAt = Date.now();
      }
    }
    if (event.kind === "button" && event.zone < 8) {
      const track = session.tracks[settings.bankOffset + event.zone];
      if (track && event.down) {
        if (event.port === 2) track.mute = !track.mute;
        if (event.port === 3) track.solo = !track.solo;
        if (event.port === 7) track.arm = !track.arm;
      }
    }
    settings.onFeedback?.(cloneSession(session));
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
      pingTimer = setInterval(() => {
        if (state === "connected") port.send(encodeHuiPing());
      }, settings.pingIntervalMs);
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
      const cc = {
        play: HUI.button.play,
        stop: HUI.button.stop,
        return: HUI.button.returnToZero,
        record: HUI.button.record,
      }[change.command];
      return encodeHuiButtonPress(cc);
    }
    const zone = trackZone(change.trackId);
    if (zone === undefined) return undefined;
    if (change.kind === "mute") return encodeHuiButtonPress(zone * 8 + HUI.button.mute);
    if (change.kind === "solo") return encodeHuiButtonPress(zone * 8 + HUI.button.solo);
    if (change.kind === "arm") return encodeHuiButtonPress(zone * 8 + HUI.button.arm);
    if (change.kind === "volume") {
      const track = findTrack(session, change.trackId);
      const db = change.absDb ?? (track?.volumeDb ?? 0) + (change.deltaDb ?? 0);
      return encodeHuiFaderGesture(zone, fader14FromNormalized(normalizedFromDb(db)));
    }
    if (change.kind === "send") {
      const track = findTrack(session, change.trackId);
      const sendIndex =
        change.sendIndex ?? track?.sends.findIndex((send) => send.dest === change.dest) ?? -1;
      const send = track?.sends[sendIndex];
      if (!track || sendIndex < 0 || !send || send.dest !== change.dest) return undefined;
      activeSendIndex = sendIndex;
      return [
        ...encodeHuiSendMode(sendIndex),
        encodeHuiRelativeKnob(zone, (change.db - send.db) / settings.sendStepDb),
      ];
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
    if (change.kind === "send") {
      const send = track.sends.find((candidate) => candidate.dest === change.dest);
      if (send) send.db = change.db;
    }
  }

  return {
    descriptor,
    config: settings,
    discover: async () => caps,
    connect,
    health,
    snapshot: async () => {
      if (health().state !== "connected")
        throw new Error("HUI adapter is not connected or has gone stale.");
      return cloneSession(session);
    },
    execute: async (operation, signal): Promise<AdapterExecutionResult> => {
      if (signal?.aborted) return cancelled(operation);
      if (health().state !== "connected")
        return refused(operation, "HUI adapter is not connected or has gone stale.");
      const supported = operation.changes.filter((change) => changeMessages(change));
      const unsupported = operation.changes.length - supported.length;
      if (operation.refusedReason) return refused(operation, operation.refusedReason);
      if (!supported.length)
        return refused(
          operation,
          "HUI exposes only surface-level control for this operation; no executable mapping exists.",
        );
      for (const change of supported) {
        sendAll(changeMessages(change) ?? []);
        applyOptimistic(change);
      }
      lastSeenAt = Date.now();
      const partial = unsupported > 0;
      return {
        operationId: operation.id,
        status: partial ? "partial" : "committed",
        completedChanges: supported.length,
        totalChanges: operation.changes.length,
        message: partial
          ? `${supported.length} HUI change(s) sent; ${unsupported} change(s) remain human-assisted.`
          : "HUI messages sent to the configured Pro Tools ports; verification awaits host feedback.",
      };
    },
    verify: async (operation, signal): Promise<AdapterVerificationResult> => {
      if (signal?.aborted || health().state !== "connected") {
        return {
          operationId: operation.id,
          status: "not_observable",
          verifyClass: operation.verifyClass,
          observed: "HUI input is not connected or has gone stale.",
        };
      }
      const observed = operation.changes
        .filter((change) => change.kind === "send")
        .map((change) => {
          const track = findTrack(session, change.trackId);
          const send = track?.sends.find((candidate) => candidate.dest === change.dest);
          return send
            ? `${track?.name} → ${send.dest} ${send.db.toFixed(1)} dB`
            : `${change.trackId} → ${change.dest} not assigned`;
        });
      return {
        operationId: operation.id,
        status: "pass",
        verifyClass: operation.verifyClass,
        observed: observed.length
          ? `Observed HUI routing feedback: ${observed.join("; ")}.`
          : "The adapter observed the HUI connection; exact host state remains coarse for this protocol.",
      };
    },
    bank: (delta) => {
      const cc = delta < 0 ? HUI.button.bankLeft : HUI.button.bankRight;
      if (health().state === "connected") sendAll(encodeHuiButtonPress(cc));
      settings.bankOffset = Math.max(0, settings.bankOffset + delta * 8);
      lastSeenAt = Date.now();
    },
    disconnect: async () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = undefined;
      port.close();
      state = "disconnected";
      permission = "unknown";
    },
  };
}

export async function createNodeProToolsHuiAdapter(
  config: ProToolsHuiConfig,
  initial?: SessionState,
): Promise<ProToolsHuiAdapter> {
  return createProToolsHuiAdapter(config, await createNodeMidiPort(), initial);
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
    message: "Execution cancelled before HUI dispatch.",
  };
}
