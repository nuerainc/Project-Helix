/**
 * Shared voice-input contract for Helix Agent.
 *
 * Voice transcripts always enter the existing intent/compiler pipeline. Voice
 * never bypasses planning, autonomy, approval, verification, or the ledger.
 */
export type VoiceInputMode = "push_to_talk" | "continuous";
export type VoiceInputPlatform = "browser_preview" | "windows" | "macos" | "linux";
export type VoiceProviderState =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "listening"
  | "stopping"
  | "permission_denied"
  | "device_lost"
  | "error";
export type VoicePermission = "unknown" | "granted" | "denied";
import type { AudioDiagnosticsSnapshot } from "./audio-diagnostics.ts";

export interface VoiceInputCapabilities {
  platform: VoiceInputPlatform;
  localTranscription: boolean;
  voiceActivityDetection: boolean;
  wakeWord: boolean;
  deviceSelection: boolean;
  continuousListening: boolean;
  pushToTalk: boolean;
}

export interface VoiceDevice {
  id: string;
  label: string;
  default: boolean;
  available: boolean;
}

export interface VoiceProviderHealth {
  state: VoiceProviderState;
  permission: VoicePermission;
  deviceId?: string;
  lastTranscriptAt?: number;
  message?: string;
  audioDiagnostics?: AudioDiagnosticsSnapshot;
}

export interface VoiceTranscript {
  text: string;
  final: boolean;
  timestamp: number;
  confidence?: number;
  source: "native" | "browser_preview" | "simulator";
}

export interface VoiceInputProvider {
  readonly id: string;
  readonly capabilities: VoiceInputCapabilities;
  health(): VoiceProviderHealth;
  listDevices(): Promise<VoiceDevice[]>;
  selectDevice(deviceId: string): Promise<void>;
  start(mode: VoiceInputMode): Promise<void>;
  stop(): Promise<void>;
  onTranscript(listener: (transcript: VoiceTranscript) => void): () => void;
  onHealth(listener: (health: VoiceProviderHealth) => void): () => void;
  onError(listener: (message: string) => void): () => void;
  onDiagnostics?(listener: (snapshot: AudioDiagnosticsSnapshot) => void): () => void;
}

export interface PcmAudioChunk {
  data: Uint8Array;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export interface NativeAudioCapture {
  readonly platform: Exclude<VoiceInputPlatform, "browser_preview">;
  listDevices(): Promise<VoiceDevice[]>;
  start(
    deviceId: string | undefined,
    onChunk: (chunk: PcmAudioChunk) => void,
    onError: (error: Error) => void,
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface LocalVoiceTranscriber {
  transcribe(chunk: PcmAudioChunk, mode: VoiceInputMode): Promise<VoiceTranscript | null>;
  reset(): Promise<void>;
}

export const DESKTOP_VOICE_TARGETS: Record<
  Exclude<VoiceInputPlatform, "browser_preview">,
  string
> = {
  windows: "Native microphone capture with WASAPI and local transcription.",
  macos: "Native microphone capture with CoreAudio and local transcription.",
  linux: "Native microphone capture with PipeWire/PulseAudio and local transcription.",
};
