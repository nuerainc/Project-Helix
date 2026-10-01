import test from "node:test";
import assert from "node:assert/strict";
import { bindVoiceRoutingBridge } from "./voice-routing-bridge.ts";
import type { SessionState } from "./types.ts";
import { createDemoSession } from "./session.ts";
import type { VoiceInputProvider, VoiceProviderHealth, VoiceTranscript } from "./voice.ts";

class FakeVoiceProvider implements VoiceInputProvider {
  readonly id = "fake-native";
  readonly capabilities = {
    platform: "linux" as const,
    localTranscription: true,
    voiceActivityDetection: true,
    wakeWord: false,
    deviceSelection: true,
    continuousListening: true,
    pushToTalk: true,
  };
  private listener?: (transcript: VoiceTranscript) => void;
  health(): VoiceProviderHealth {
    return { state: "ready", permission: "granted" };
  }
  async listDevices() {
    return [];
  }
  async selectDevice() {}
  async start() {}
  async stop() {}
  onTranscript(listener: (transcript: VoiceTranscript) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  onHealth() {
    return () => undefined;
  }
  onError() {
    return () => undefined;
  }
  emit(transcript: VoiceTranscript) {
    this.listener?.(transcript);
  }
}

function session(): SessionState {
  return createDemoSession();
}

test("bridge forwards only final native voice prompts and adapter feedback", async () => {
  const provider = new FakeVoiceProvider();
  const prompts: string[] = [];
  const feedback: SessionState[] = [];
  const bridge = bindVoiceRoutingBridge(provider, {
    onTranscript: (transcript) => {
      prompts.push(transcript.text);
    },
    onAdapterFeedback: (snapshot) => feedback.push(snapshot),
  });

  provider.emit({
    text: "send vocal to reverb at -12 dB",
    final: false,
    timestamp: 1,
    source: "native",
  });
  provider.emit({
    text: "send vocal to reverb at -12 dB",
    final: true,
    timestamp: 2,
    source: "native",
  });
  const snapshot = session();
  bridge.forwardAdapterFeedback(snapshot);

  assert.deepEqual(prompts, ["send vocal to reverb at -12 dB"]);
  assert.equal(feedback[0], snapshot);
  bridge.dispose();
  provider.emit({ text: "ignored", final: true, timestamp: 3, source: "native" });
  assert.equal(prompts.length, 1);
});
