import { spawn } from "node:child_process";
import type {
  LocalVoiceTranscriber,
  PcmAudioChunk,
  VoiceInputMode,
  VoiceTranscript,
} from "./voice.ts";

export interface LocalTranscriberOptions {
  command?: string;
  args?: string[];
  timeoutMs?: number;
  sampleRate?: number;
  channels?: number;
}

/**
 * Bridges Helix to an installed local recognizer such as whisper.cpp.
 * Audio is held in memory, piped to stdin, and discarded after each call.
 */
export function createLocalCommandTranscriber(
  options: LocalTranscriberOptions = {},
): LocalVoiceTranscriber {
  const command = options.command ?? process.env.HELIX_TRANSCRIBER_COMMAND ?? "whisper-cli";
  const args =
    options.args ??
    (process.env.HELIX_TRANSCRIBER_ARGS
      ? process.env.HELIX_TRANSCRIBER_ARGS.split(" ")
      : ["--stdin", "--no-timestamps", "--language", "en"]);
  const timeoutMs = options.timeoutMs ?? 8_000;
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;

  return {
    transcribe: async (
      chunk: PcmAudioChunk,
      _mode: VoiceInputMode,
    ): Promise<VoiceTranscript | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const output = await runRecognizer(
          command,
          args,
          wavPcm(chunk.data, chunk.sampleRate || sampleRate, chunk.channels || channels),
          controller.signal,
        );
        const text = output.trim();
        return text ? { text, final: true, timestamp: Date.now(), source: "native" } : null;
      } finally {
        clearTimeout(timer);
      }
    },
    reset: async () => undefined,
  };
}

function runRecognizer(
  command: string,
  args: string[],
  input: Uint8Array,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(output).toString("utf8"))
        : reject(
            new Error(errors.trim() || `Transcriber exited with status ${code ?? "unknown"}.`),
          ),
    );
    signal.addEventListener(
      "abort",
      () => {
        child.kill();
        reject(new Error("Local transcription timed out; microphone capture remains stoppable."));
      },
      { once: true },
    );
    child.stdin.end(Buffer.from(input));
  });
}

function wavPcm(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const bytesPerSample = 2;
  const byteRate = sampleRate * channels * bytesPerSample;
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const result = new Uint8Array(44 + pcm.byteLength);
  result.set(new Uint8Array(header));
  result.set(pcm, 44);
  return result;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}
