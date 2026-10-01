#!/usr/bin/env node
import {
  createEnergyVad,
  createNativeVoiceProvider,
  createProcessAudioCapture,
} from "../src/lib/helix/native-voice-provider.server.ts";
import { createLocalCommandTranscriber } from "../src/lib/helix/local-voice-transcriber.server.ts";

if (process.argv.includes("--help")) {
  console.log("Native booth listener: npm run voice:booth [-- --push-to-talk]");
  console.log(
    "Optional environment: HELIX_MIC_DEVICE, HELIX_VAD_THRESHOLD, HELIX_TRANSCRIBER_COMMAND, HELIX_TRANSCRIBER_ARGS",
  );
  console.log("Default capture: WASAPI/CoreAudio via ffmpeg on Windows/macOS, parec on Linux.");
  process.exit(0);
}

const mode = process.argv.includes("--push-to-talk") ? "push_to_talk" : "continuous";
const provider = createNativeVoiceProvider({
  capture: createProcessAudioCapture(),
  transcriber: createLocalCommandTranscriber(),
  vad: createEnergyVad(Number(process.env.HELIX_VAD_THRESHOLD ?? 0.015)),
});

provider.onHealth((health) => console.log(`[voice] ${health.state}: ${health.message ?? ""}`));
provider.onError((message) => console.error(`[voice:error] ${message}`));
provider.onTranscript((transcript) => console.log(`[voice:transcript] ${transcript.text}`));
provider.onDiagnostics?.((snapshot) =>
  console.log(
    `[audio] ${snapshot.status} input=${snapshot.inputLatencyMs?.toFixed(1) ?? "-"}ms jitter=${snapshot.jitterMs.toFixed(1)}ms cpu=${snapshot.cpuLoadPercent.toFixed(0)}% xruns=${snapshot.xruns} dropouts=${snapshot.dropouts}`,
  ),
);

const devices = await provider.listDevices();
console.log("Available microphones:");
for (const device of devices)
  console.log(`  ${device.id}: ${device.label}${device.default ? " (default)" : ""}`);
const selected =
  process.env.HELIX_MIC_DEVICE ?? devices.find((device) => device.default)?.id ?? devices[0]?.id;
if (selected) await provider.selectDevice(selected);
await provider.start(mode);
console.log(
  `Native booth listener active in ${mode} mode. Press Ctrl+C to stop. Raw audio is not stored.`,
);

const shutdown = async () => {
  await provider.stop();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.stdin.resume();
await new Promise<void>(() => {});
