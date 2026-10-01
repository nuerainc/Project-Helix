import { spawn, type ChildProcess } from "node:child_process";
import { platform as osPlatform } from "node:os";
import type {
  LocalVoiceTranscriber,
  NativeAudioCapture,
  PcmAudioChunk,
  VoiceDevice,
  VoiceInputMode,
  VoiceInputPlatform,
  VoiceInputProvider,
  VoiceProviderHealth,
  VoiceTranscript,
} from "./voice.ts";
import {
  createAudioDiagnosticsMonitor,
  type AudioDiagnosticsSnapshot,
} from "./audio-diagnostics.ts";

export interface NativeVoiceProviderOptions {
  platform?: Exclude<VoiceInputPlatform, "browser_preview">;
  capture: NativeAudioCapture;
  transcriber: LocalVoiceTranscriber;
  vad?: VoiceActivityDetector;
}

export interface VoiceActivityDetector {
  isSpeech(chunk: PcmAudioChunk): boolean;
}

export interface ProcessAudioCaptureOptions {
  platform?: Exclude<VoiceInputPlatform, "browser_preview">;
  command?: string;
  args?: string[];
  sampleRate?: number;
  channels?: number;
  deviceLister?: () => Promise<VoiceDevice[]>;
}

export function createNativeVoiceProvider(options: NativeVoiceProviderOptions): VoiceInputProvider {
  const platform = options.platform ?? options.capture.platform;
  const capabilities = {
    platform,
    localTranscription: true,
    voiceActivityDetection: Boolean(options.vad),
    wakeWord: false,
    deviceSelection: true,
    continuousListening: true,
    pushToTalk: true,
  } as const;
  const transcripts = new Set<(transcript: VoiceTranscript) => void>();
  const healthListeners = new Set<(health: VoiceProviderHealth) => void>();
  const errorListeners = new Set<(message: string) => void>();
  const diagnostics = createAudioDiagnosticsMonitor();
  const diagnosticsListeners = new Set<(snapshot: AudioDiagnosticsSnapshot) => void>();
  let providerHealth: VoiceProviderHealth = {
    state: "idle",
    permission: "unknown",
    message: "Native microphone provider is idle. No audio is captured or retained.",
  };
  let mode: VoiceInputMode | undefined;
  let selectedDevice: string | undefined;
  let stopping = false;

  function setHealth(next: VoiceProviderHealth): void {
    providerHealth = next;
    for (const listener of healthListeners) listener(next);
  }

  function fail(error: unknown, state: VoiceProviderHealth["state"] = "error"): void {
    const message = error instanceof Error ? error.message : String(error);
    setHealth({ ...providerHealth, state, message });
    for (const listener of errorListeners) listener(message);
  }

  async function onChunk(chunk: PcmAudioChunk): Promise<void> {
    if (stopping || !mode) return;
    if (options.vad && !options.vad.isSpeech(chunk)) return;
    const startedAt = Date.now();
    try {
      const transcript = await options.transcriber.transcribe(chunk, mode);
      const snapshot = diagnostics.record({
        timestamp: chunk.timestamp,
        sampleRate: chunk.sampleRate,
        channels: chunk.channels,
        bufferBytes: chunk.data.byteLength,
        capturedAt: Date.now(),
        processingMs: Date.now() - startedAt,
      });
      for (const listener of diagnosticsListeners) listener(snapshot);
      setHealth({ ...providerHealth, audioDiagnostics: snapshot });
      if (!transcript || !transcript.text.trim()) return;
      const next = {
        ...transcript,
        source: "native" as const,
        timestamp: transcript.timestamp || Date.now(),
      };
      setHealth({ ...providerHealth, state: "listening", lastTranscriptAt: next.timestamp });
      for (const listener of transcripts) listener(next);
    } catch (error) {
      fail(error);
    }
  }

  return {
    id: `native-${platform}-booth-mic`,
    capabilities,
    health: () => providerHealth,
    listDevices: () => options.capture.listDevices(),
    selectDevice: async (deviceId) => {
      const devices = await options.capture.listDevices();
      const device = devices.find((candidate) => candidate.id === deviceId && candidate.available);
      if (!device) throw new Error(`Microphone device is not available: ${deviceId}`);
      selectedDevice = device.id;
      setHealth({
        ...providerHealth,
        deviceId: device.id,
        state: "ready",
        message: `Microphone selected: ${device.label}.`,
      });
    },
    start: async (nextMode) => {
      if (providerHealth.state === "listening") return;
      mode = nextMode;
      stopping = false;
      setHealth({
        ...providerHealth,
        state: "requesting_permission",
        message: "Requesting native microphone permission…",
      });
      try {
        await options.transcriber.reset();
        await options.capture.start(
          selectedDevice,
          (chunk) => void onChunk(chunk),
          (error) => fail(error, "device_lost"),
        );
        setHealth({
          ...providerHealth,
          state: "listening",
          permission: "granted",
          message:
            nextMode === "continuous"
              ? "Booth listening is active. Stop is always available; raw audio is not stored."
              : "Push-to-talk microphone is active.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const denied = /permission|access|denied|not permitted/i.test(message);
        fail(error, denied ? "permission_denied" : "error");
        throw error;
      }
    },
    stop: async () => {
      if (providerHealth.state === "idle" || providerHealth.state === "ready") return;
      stopping = true;
      setHealth({ ...providerHealth, state: "stopping", message: "Stopping microphone capture…" });
      await options.capture.stop();
      await options.transcriber.reset();
      mode = undefined;
      setHealth({
        ...providerHealth,
        state: "ready",
        message: "Microphone stopped. No raw audio was stored.",
      });
    },
    onTranscript: (listener) => {
      transcripts.add(listener);
      return () => transcripts.delete(listener);
    },
    onHealth: (listener) => {
      healthListeners.add(listener);
      listener(providerHealth);
      return () => healthListeners.delete(listener);
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    onDiagnostics: (listener) => {
      diagnosticsListeners.add(listener);
      const current = diagnostics.latest();
      if (current) listener(current);
      return () => diagnosticsListeners.delete(listener);
    },
  };
}

export function createEnergyVad(threshold = 0.015): VoiceActivityDetector {
  return {
    isSpeech: (chunk) => {
      const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
      if (view.byteLength < 2) return false;
      let sum = 0;
      for (let offset = 0; offset + 1 < view.byteLength; offset += 2) {
        const sample = view.getInt16(offset, true) / 32768;
        sum += sample * sample;
      }
      return Math.sqrt(sum / Math.max(1, view.byteLength / 2)) >= threshold;
    },
  };
}

export function createProcessAudioCapture(
  options: ProcessAudioCaptureOptions = {},
): NativeAudioCapture {
  const platform = options.platform ?? detectPlatform();
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;
  let process: ChildProcess | undefined;
  let stopped = false;
  const defaultCommand =
    platform === "windows" ? "ffmpeg" : platform === "macos" ? "ffmpeg" : "parec";
  const defaultArgs =
    platform === "windows"
      ? [
          "-f",
          "dshow",
          "-i",
          "audio=default",
          "-f",
          "s16le",
          "-ar",
          String(sampleRate),
          "-ac",
          String(channels),
          "pipe:1",
        ]
      : platform === "macos"
        ? [
            "-f",
            "avfoundation",
            "-i",
            ":default",
            "-f",
            "s16le",
            "-ar",
            String(sampleRate),
            "-ac",
            String(channels),
            "pipe:1",
          ]
        : ["--format=s16le", `--rate=${sampleRate}`, `--channels=${channels}`, "--raw", "-"];

  return {
    platform,
    listDevices:
      options.deviceLister ??
      (async () => [
        { id: "default", label: "System default microphone", default: true, available: true },
      ]),
    start: async (_deviceId, onChunk, onError) => {
      if (process) return;
      stopped = false;
      const child = spawn(options.command ?? defaultCommand, options.args ?? defaultArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      process = child;
      child.stdout.on("data", (data: Buffer) => {
        if (stopped) return;
        onChunk({ data: new Uint8Array(data), sampleRate, channels, timestamp: Date.now() });
      });
      child.stderr.on("data", () => {
        /* Native capture diagnostics are intentionally not transcribed. */
      });
      child.on("error", onError);
      child.on("close", (code) => {
        process = undefined;
        if (!stopped && code !== 0)
          onError(new Error(`Microphone capture exited with status ${code ?? "unknown"}.`));
      });
    },
    stop: async () => {
      stopped = true;
      if (!process) return;
      process.kill();
      process = undefined;
    },
  };
}

function detectPlatform(): Exclude<VoiceInputPlatform, "browser_preview"> {
  const value = osPlatform();
  if (value === "win32") return "windows";
  if (value === "darwin") return "macos";
  return "linux";
}
