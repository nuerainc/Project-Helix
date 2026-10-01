import type {
  CapabilityGraph,
  Change,
  Operation,
  SessionState,
  VerifyClass,
} from "../helix/types.ts";
import { hostById } from "../helix/hosts.ts";
import { cloneSession, createDemoSession, findTrack } from "../helix/session.ts";

export type AdapterState = "disconnected" | "connecting" | "connected" | "stale" | "error";
export type AdapterPermission = "unknown" | "granted" | "denied";

export interface AdapterDescriptor {
  id: string;
  label: string;
  version: string;
  host: CapabilityGraph["host"];
  protocol: CapabilityGraph["protocol"];
  platforms: Array<"windows" | "macos" | "linux">;
}

export interface AdapterHealth {
  state: AdapterState;
  permission: AdapterPermission;
  latencyMs?: number;
  lastSeenAt?: number;
  staleAfterMs: number;
  message?: string;
}

export interface AdapterExecutionResult {
  operationId: string;
  status: "committed" | "partial" | "refused" | "failed" | "cancelled";
  completedChanges: number;
  totalChanges: number;
  message: string;
}

export interface AdapterVerificationResult {
  operationId: string;
  status: "pass" | "fail" | "not_observable";
  verifyClass: VerifyClass;
  observed: string;
}

/**
 * The shared v0.3.0 adapter boundary. UI and compiler code must depend on
 * this contract rather than a Pro Tools, REAPER, or protocol-specific class.
 */
export interface HelixAdapter {
  readonly descriptor: AdapterDescriptor;
  discover(): Promise<CapabilityGraph>;
  connect(): Promise<AdapterHealth>;
  health(): AdapterHealth;
  snapshot(): Promise<SessionState>;
  execute(operation: Operation, signal?: AbortSignal): Promise<AdapterExecutionResult>;
  verify(operation: Operation, signal?: AbortSignal): Promise<AdapterVerificationResult>;
  disconnect(): Promise<void>;
}

/**
 * A deterministic HUI fixture for conformance and UI development. It does not
 * open MIDI ports or control Pro Tools; live transport belongs in a desktop
 * provider implementing the same HelixAdapter contract.
 */
export function createProToolsHuiSimulator(initial = createDemoSession()): HelixAdapter {
  const caps = hostById("protools");
  let state: AdapterState = "disconnected";
  let session = cloneSession(initial);
  let lastSeenAt: number | undefined;
  const beforeByOperation = new Map<string, SessionState>();

  const descriptor: AdapterDescriptor = {
    id: "protools-hui-simulator",
    label: "Pro Tools · HUI simulator",
    version: "0.3.0-sim",
    host: "protools",
    protocol: "HUI",
    platforms: ["windows", "macos", "linux"],
  };

  function health(): AdapterHealth {
    const stale =
      state === "connected" && lastSeenAt !== undefined && Date.now() - lastSeenAt > 2_000;
    const effectiveState = stale ? "stale" : state;
    return {
      state: effectiveState,
      permission: effectiveState === "connected" ? "granted" : "unknown",
      latencyMs: effectiveState === "connected" ? 0 : undefined,
      lastSeenAt,
      staleAfterMs: 2_000,
      message:
        effectiveState === "connected"
          ? "Simulator connected. No live MIDI or Pro Tools process is attached."
          : "Simulator disconnected. Live HUI transport is not implemented.",
    };
  }

  return {
    descriptor,
    discover: async () => caps,
    connect: async () => {
      state = "connected";
      lastSeenAt = Date.now();
      return health();
    },
    health,
    snapshot: async () => {
      if (state !== "connected") throw new Error("Adapter is not connected.");
      lastSeenAt = Date.now();
      return cloneSession(session);
    },
    execute: async (operation, signal) => {
      if (signal?.aborted) {
        return {
          operationId: operation.id,
          status: "cancelled",
          completedChanges: 0,
          totalChanges: operation.changes.length,
          message: "Execution cancelled before dispatch.",
        };
      }
      if (state !== "connected") {
        return {
          operationId: operation.id,
          status: "refused",
          completedChanges: 0,
          totalChanges: operation.changes.length,
          message: "Pro Tools HUI simulator is disconnected; no commit claimed.",
        };
      }
      if (operation.refusedReason) {
        return {
          operationId: operation.id,
          status: "refused",
          completedChanges: 0,
          totalChanges: operation.changes.length,
          message: operation.refusedReason,
        };
      }
      beforeByOperation.set(operation.id, cloneSession(session));
      const allowed = operation.changes.slice(0, 1);
      for (const change of allowed) session = applySimulatorChange(session, change);
      lastSeenAt = Date.now();
      const partial = allowed.length < operation.changes.length;
      return {
        operationId: operation.id,
        status: partial ? "partial" : "committed",
        completedChanges: allowed.length,
        totalChanges: operation.changes.length,
        message: partial
          ? "HUI simulator applied one change; remaining changes require a queued retry."
          : "HUI simulator applied the operation; no live Pro Tools connection is claimed.",
      };
    },
    verify: async (operation, signal) => {
      if (signal?.aborted || state !== "connected") {
        return {
          operationId: operation.id,
          status: "not_observable",
          verifyClass: operation.verifyClass,
          observed: "Adapter is not connected to an observable host.",
        };
      }
      const before = beforeByOperation.get(operation.id) ?? session;
      const failures = operation.changes.filter(
        (change) => !changeMatches(before, session, change),
      );
      lastSeenAt = Date.now();
      return {
        operationId: operation.id,
        status: failures.length ? "fail" : "pass",
        verifyClass: operation.verifyClass,
        observed: failures.length
          ? `${failures.length} change(s) were not observable.`
          : "Simulator state matches the dispatched change.",
      };
    },
    disconnect: async () => {
      state = "disconnected";
    },
  };
}

function applySimulatorChange(session: SessionState, change: Change): SessionState {
  const next = cloneSession(session);
  if (change.kind === "transport") {
    next.playing = change.command === "play";
    if (change.command === "return") next.playhead = 0;
    return next;
  }
  const track = findTrack(next, change.trackId);
  if (!track) return next;
  if (change.kind === "mute" || change.kind === "solo" || change.kind === "arm")
    track[change.kind] = change.enabled;
  if (change.kind === "volume")
    track.volumeDb = change.absDb ?? track.volumeDb + (change.deltaDb ?? 0);
  return next;
}

function changeMatches(before: SessionState, after: SessionState, change: Change): boolean {
  if (change.kind === "transport") {
    return change.command === "play"
      ? after.playing
      : change.command === "stop"
        ? !after.playing
        : after.playhead === 0;
  }
  const beforeTrack = findTrack(before, change.trackId);
  const afterTrack = findTrack(after, change.trackId);
  if (!beforeTrack || !afterTrack) return false;
  if (change.kind === "mute" || change.kind === "solo" || change.kind === "arm")
    return afterTrack[change.kind] === change.enabled;
  if (change.kind === "volume")
    return afterTrack.volumeDb === (change.absDb ?? beforeTrack.volumeDb + (change.deltaDb ?? 0));
  return true;
}

export function createDisconnectedAdapterHealth(message: string): AdapterHealth {
  return {
    state: "disconnected",
    permission: "unknown",
    staleAfterMs: 2_000,
    message,
  };
}
