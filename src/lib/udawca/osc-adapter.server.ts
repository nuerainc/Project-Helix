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
import {
  decodeOscMessage,
  encodeOscMessage,
  oscBankAddress,
  oscTrackAddress,
  oscTransportAddress,
  type OscMessage,
} from "./osc-protocol.ts";

export interface OscTransport {
  open(onPacket: (packet: Uint8Array) => void, onError: (error: Error) => void): Promise<void>;
  send(packet: Uint8Array): void;
  close(): Promise<void>;
}

export interface OscConfig {
  localPort: number;
  remoteHost: string;
  remotePort: number;
  staleAfterMs?: number;
  bankOffset?: number;
}

export interface OscAdapter extends HelixAdapter {
  readonly config: Required<OscConfig>;
  bank(delta: -1 | 1): void;
}

const descriptor: AdapterDescriptor = {
  id: "helix-osc-native",
  label: "Helix OSC · native UDP",
  version: "0.4.0-dev",
  host: "protools",
  protocol: "OSC",
  platforms: ["windows", "macos", "linux"],
};

export function createOscAdapter(
  config: OscConfig,
  transport: OscTransport,
  initial: SessionState = createDemoSession(),
): OscAdapter {
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
          ? `OSC connected to ${settings.remoteHost}:${settings.remotePort}.`
          : effectiveState === "stale"
            ? "OSC feedback has gone stale; reconnect before committing more work."
            : "Native OSC adapter is disconnected."),
    };
  }

  function send(message: OscMessage): void {
    transport.send(encodeOscMessage(message));
  }

  function onPacket(packet: Uint8Array): void {
    lastSeenAt = Date.now();
    let message: OscMessage;
    try {
      message = decodeOscMessage(packet);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      return;
    }
    const trackMatch = message.address.match(/^\/helix\/track\/(\d+)\/(mute|solo|arm|volume)$/);
    if (trackMatch) {
      const zone = Number(trackMatch[1]);
      const field = trackMatch[2] as "mute" | "solo" | "arm" | "volume";
      const track = session.tracks[settings.bankOffset + zone];
      const value = message.args[0];
      if (!track || value === undefined) return;
      if (field === "volume" && typeof value === "number") track.volumeDb = value;
      if (field !== "volume" && typeof value === "boolean") track[field] = value;
      if (field !== "volume" && typeof value === "number") track[field] = value > 0;
      return;
    }
    if (message.address === "/helix/transport/playing" && typeof message.args[0] === "boolean") {
      session.playing = message.args[0];
    }
  }

  function connect(): Promise<AdapterHealth> {
    return transport
      .open(onPacket, (error) => {
        lastError = error.message;
        state = "error";
      })
      .then(() => {
        state = "connected";
        permission = "granted";
        lastSeenAt = Date.now();
        return health();
      })
      .catch((error) => {
        state = "error";
        permission = "unknown";
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      });
  }

  function trackZone(trackId: string): number | undefined {
    const index = session.tracks.findIndex((track) => track.id === trackId);
    const zone = index - settings.bankOffset;
    return zone >= 0 && zone < 8 ? zone : undefined;
  }

  function changeMessage(change: Change): OscMessage | undefined {
    if (change.kind === "transport") {
      if (change.command === "return") return undefined;
      return { address: oscTransportAddress(change.command), args: [true] };
    }
    const zone = trackZone(change.trackId);
    if (zone === undefined) return undefined;
    if (change.kind === "mute" || change.kind === "solo" || change.kind === "arm") {
      return { address: oscTrackAddress(zone, change.kind), args: [change.enabled] };
    }
    if (change.kind === "volume") {
      const track = findTrack(session, change.trackId);
      const db = change.absDb ?? (track?.volumeDb ?? 0) + (change.deltaDb ?? 0);
      return { address: oscTrackAddress(zone, "volume"), args: [db] };
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
      if (health().state !== "connected") throw new Error("OSC adapter is not connected.");
      return cloneSession(session);
    },
    execute: async (operation, signal): Promise<AdapterExecutionResult> => {
      if (signal?.aborted) return cancelled(operation);
      if (health().state !== "connected")
        return refused(operation, "OSC adapter is not connected or has gone stale.");
      if (operation.refusedReason) return refused(operation, operation.refusedReason);
      const supported = operation.changes
        .map((change) => ({ change, message: changeMessage(change) }))
        .filter(
          (entry): entry is { change: Change; message: OscMessage } => entry.message !== undefined,
        );
      const unsupported = operation.changes.length - supported.length;
      if (!supported.length)
        return refused(operation, "OSC adapter has no typed mapping for this operation.");
      for (const entry of supported) {
        send(entry.message);
        applyOptimistic(entry.change);
      }
      lastSeenAt = Date.now();
      return {
        operationId: operation.id,
        status: unsupported ? "partial" : "committed",
        completedChanges: supported.length,
        totalChanges: operation.changes.length,
        message: unsupported
          ? `${supported.length} OSC change(s) sent; ${unsupported} change(s) remain human-assisted.`
          : "Typed OSC messages sent; verification awaits OSC feedback.",
      };
    },
    verify: async (operation, signal): Promise<AdapterVerificationResult> => {
      if (signal?.aborted || health().state !== "connected") {
        return {
          operationId: operation.id,
          status: "not_observable",
          verifyClass: operation.verifyClass,
          observed: "OSC feedback is not connected or has gone stale.",
        };
      }
      return {
        operationId: operation.id,
        status: "pass",
        verifyClass: operation.verifyClass,
        observed:
          "OSC transport is connected; exact host state depends on the configured OSC profile.",
      };
    },
    bank: (delta) => {
      send({ address: oscBankAddress(), args: [delta] });
      settings.bankOffset = Math.max(0, settings.bankOffset + delta * 8);
      lastSeenAt = Date.now();
    },
    disconnect: async () => {
      await transport.close();
      state = "disconnected";
      permission = "unknown";
    },
  };
}

export async function createNodeOscAdapter(
  config: OscConfig,
  initial?: SessionState,
): Promise<OscAdapter> {
  return createOscAdapter(config, await createNodeOscTransport(config), initial);
}

export async function createNodeOscTransport(config: OscConfig): Promise<OscTransport> {
  const dgram = await import("node:dgram");
  const socket = dgram.createSocket("udp4");
  let opened = false;
  return {
    open: (onPacket, onError) =>
      new Promise<void>((resolve, reject) => {
        socket.on("message", (message) => onPacket(new Uint8Array(message)));
        socket.on("error", (error) => {
          onError(error);
          if (!opened) reject(error);
        });
        socket.bind(config.localPort, () => {
          opened = true;
          resolve();
        });
      }),
    send: (packet) => {
      socket.send(packet, config.remotePort, config.remoteHost);
    },
    close: () =>
      new Promise<void>((resolve) => {
        if (!opened) return resolve();
        socket.close(() => resolve());
        opened = false;
      }),
  };
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
    message: "Execution cancelled before OSC dispatch.",
  };
}
