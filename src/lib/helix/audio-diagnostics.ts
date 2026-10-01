export type AudioHealthStatus = "healthy" | "degraded" | "critical";

export interface AudioDiagnosticsSnapshot {
  timestamp: number;
  sampleRate: number;
  channels: number;
  bufferFrames: number;
  inputLatencyMs?: number;
  outputLatencyMs?: number;
  roundTripLatencyMs?: number;
  jitterMs: number;
  processingMs: number;
  cpuLoadPercent: number;
  xruns: number;
  dropouts: number;
  status: AudioHealthStatus;
  message: string;
}

export interface AudioDiagnosticsMonitor {
  latest(): AudioDiagnosticsSnapshot | null;
  record(input: {
    timestamp: number;
    sampleRate: number;
    channels: number;
    bufferBytes: number;
    capturedAt?: number;
    processingMs?: number;
    inputLatencyMs?: number;
    outputLatencyMs?: number;
  }): AudioDiagnosticsSnapshot;
  reset(): void;
  onUpdate(listener: (snapshot: AudioDiagnosticsSnapshot) => void): () => void;
}

export function createAudioDiagnosticsMonitor(): AudioDiagnosticsMonitor {
  let latestSnapshot: AudioDiagnosticsSnapshot | null = null;
  let previousTimestamp: number | undefined;
  let xruns = 0;
  let dropouts = 0;
  const listeners = new Set<(snapshot: AudioDiagnosticsSnapshot) => void>();

  function record(
    input: Parameters<AudioDiagnosticsMonitor["record"]>[0],
  ): AudioDiagnosticsSnapshot {
    const capturedAt = input.capturedAt ?? Date.now();
    const bufferFrames = Math.max(
      1,
      Math.floor(input.bufferBytes / Math.max(1, input.channels * 2)),
    );
    const expectedMs = (bufferFrames / Math.max(1, input.sampleRate)) * 1000;
    const intervalMs =
      previousTimestamp === undefined ? expectedMs : input.timestamp - previousTimestamp;
    previousTimestamp = input.timestamp;
    const jitterMs = Math.abs(intervalMs - expectedMs);
    if (intervalMs > expectedMs * 1.75) {
      xruns += 1;
      dropouts += Math.max(1, Math.floor(intervalMs / expectedMs) - 1);
    }
    const processingMs = input.processingMs ?? Math.max(0, capturedAt - input.timestamp);
    const cpuLoadPercent = Math.min(999, (processingMs / expectedMs) * 100);
    const inputLatencyMs = input.inputLatencyMs ?? Math.max(0, capturedAt - input.timestamp);
    const outputLatencyMs = input.outputLatencyMs;
    const roundTripLatencyMs =
      outputLatencyMs === undefined ? undefined : inputLatencyMs + outputLatencyMs;
    const critical = xruns > 3 || dropouts > 5 || cpuLoadPercent >= 95;
    const degraded =
      !critical && (jitterMs > expectedMs * 0.25 || cpuLoadPercent >= 70 || inputLatencyMs > 80);
    const status: AudioHealthStatus = critical ? "critical" : degraded ? "degraded" : "healthy";
    const message = critical
      ? "Audio engine is under pressure; reduce buffer load or inspect the device path."
      : degraded
        ? "Audio performance is degraded; latency or scheduling jitter is elevated."
        : "Audio performance is within the current monitoring thresholds.";
    latestSnapshot = {
      timestamp: capturedAt,
      sampleRate: input.sampleRate,
      channels: input.channels,
      bufferFrames,
      inputLatencyMs,
      outputLatencyMs,
      roundTripLatencyMs,
      jitterMs,
      processingMs,
      cpuLoadPercent,
      xruns,
      dropouts,
      status,
      message,
    };
    for (const listener of listeners) listener(latestSnapshot);
    return latestSnapshot;
  }

  return {
    latest: () => latestSnapshot,
    record,
    reset: () => {
      latestSnapshot = null;
      previousTimestamp = undefined;
      xruns = 0;
      dropouts = 0;
    },
    onUpdate: (listener) => {
      listeners.add(listener);
      if (latestSnapshot) listener(latestSnapshot);
      return () => listeners.delete(listener);
    },
  };
}
