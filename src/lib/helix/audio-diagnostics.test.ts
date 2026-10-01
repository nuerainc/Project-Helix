import test from "node:test";
import assert from "node:assert/strict";
import { createAudioDiagnosticsMonitor } from "./audio-diagnostics.ts";

test("audio diagnostics measures latency and remains healthy under expected cadence", () => {
  const monitor = createAudioDiagnosticsMonitor();
  const first = monitor.record({
    timestamp: 1000,
    capturedAt: 1004,
    sampleRate: 48000,
    channels: 2,
    bufferBytes: 1920,
    processingMs: 1,
  });
  const second = monitor.record({
    timestamp: 1010,
    capturedAt: 1012,
    sampleRate: 48000,
    channels: 2,
    bufferBytes: 1920,
    processingMs: 1,
  });
  assert.equal(first.bufferFrames, 480);
  assert.equal(second.status, "healthy");
  assert.equal(second.xruns, 0);
});

test("audio diagnostics flags missed buffers and high processing load", () => {
  const monitor = createAudioDiagnosticsMonitor();
  monitor.record({
    timestamp: 1000,
    capturedAt: 1005,
    sampleRate: 48000,
    channels: 2,
    bufferBytes: 1920,
    processingMs: 1,
  });
  const sample = monitor.record({
    timestamp: 1100,
    capturedAt: 1150,
    sampleRate: 48000,
    channels: 2,
    bufferBytes: 1920,
    processingMs: 25,
  });
  assert.equal(sample.status, "critical");
  assert.ok(sample.xruns > 0);
  assert.ok(sample.dropouts > 0);
});
