import test from "node:test";
import assert from "node:assert/strict";
import { createNativeVoiceProvider, createEnergyVad } from "./native-voice-provider.server.ts";
import type {
  LocalVoiceTranscriber,
  NativeAudioCapture,
  PcmAudioChunk,
  VoiceDevice,
} from "./voice.ts";

class FakeCapture implements NativeAudioCapture {
  readonly platform = "linux" as const;
  started = false;
  stopped = false;
  private onChunk?: (chunk: PcmAudioChunk) => void;
  private onError?: (error: Error) => void;
  async listDevices(): Promise<VoiceDevice[]> {
    return [{ id: "mic-1", label: "Booth mic", default: true, available: true }];
  }
  async start(
    _deviceId: string | undefined,
    onChunk: (chunk: PcmAudioChunk) => void,
    onError: (error: Error) => void,
  ) {
    this.started = true;
    this.onChunk = onChunk;
    this.onError = onError;
  }
  async stop() {
    this.stopped = true;
  }
  emit(chunk: PcmAudioChunk) {
    this.onChunk?.(chunk);
  }
  fail(message: string) {
    this.onError?.(new Error(message));
  }
}

class FakeTranscriber implements LocalVoiceTranscriber {
  resetCount = 0;
  async reset() {
    this.resetCount += 1;
  }
  async transcribe(_chunk: PcmAudioChunk) {
    return {
      text: "mute the vocal",
      final: true,
      timestamp: Date.now(),
      source: "native" as const,
    };
  }
}

function speechChunk(): PcmAudioChunk {
  const data = new Uint8Array(320);
  const view = new DataView(data.buffer);
  for (let i = 0; i < data.byteLength; i += 2) view.setInt16(i, 10000, true);
  return { data, sampleRate: 16_000, channels: 1, timestamp: Date.now() };
}

test("native provider selects a device, emits final transcripts, and stops without persistence", async () => {
  const capture = new FakeCapture();
  const transcriber = new FakeTranscriber();
  const provider = createNativeVoiceProvider({ capture, transcriber, vad: createEnergyVad(0.01) });
  const transcripts: string[] = [];
  provider.onTranscript((transcript) => transcripts.push(transcript.text));
  await provider.selectDevice("mic-1");
  await provider.start("continuous");
  capture.emit(speechChunk());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(transcripts, ["mute the vocal"]);
  assert.equal(provider.health().state, "listening");
  await provider.stop();
  assert.equal(capture.stopped, true);
  assert.equal(provider.health().state, "ready");
});

test("native provider gates silence with VAD and reports device loss", async () => {
  const capture = new FakeCapture();
  const provider = createNativeVoiceProvider({
    capture,
    transcriber: new FakeTranscriber(),
    vad: createEnergyVad(0.5),
  });
  const transcripts: string[] = [];
  provider.onTranscript((transcript) => transcripts.push(transcript.text));
  await provider.start("push_to_talk");
  capture.emit({
    data: new Uint8Array(320),
    sampleRate: 16_000,
    channels: 1,
    timestamp: Date.now(),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(transcripts, []);
  capture.fail("Microphone device disconnected");
  assert.equal(provider.health().state, "device_lost");
  assert.match(provider.health().message ?? "", /disconnected/);
});

test("permission failures become actionable provider health", async () => {
  const capture = new FakeCapture();
  capture.start = async () => {
    throw new Error("Microphone permission denied by operating system");
  };
  const provider = createNativeVoiceProvider({ capture, transcriber: new FakeTranscriber() });
  await assert.rejects(() => provider.start("push_to_talk"));
  assert.equal(provider.health().state, "permission_denied");
  assert.equal(provider.health().permission, "unknown");
});
