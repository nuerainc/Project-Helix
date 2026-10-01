import type { SessionState } from "./types.ts";
import type { AudioDiagnosticsSnapshot } from "./audio-diagnostics.ts";
import type { VoiceInputProvider, VoiceTranscript } from "./voice.ts";

export interface VoiceRoutingBridgeSinks {
  onTranscript: (transcript: VoiceTranscript) => void | Promise<void>;
  onAdapterFeedback: (session: SessionState) => void;
  onAudioDiagnostics?: (snapshot: AudioDiagnosticsSnapshot) => void;
}

/**
 * Connects the native booth voice stream to the existing intent pipeline and
 * connects native surface feedback to the same live session view. The bridge
 * never executes an intent directly: the transcript sink remains responsible
 * for compile, approval, execution, and verification.
 */
export function bindVoiceRoutingBridge(
  provider: VoiceInputProvider,
  sinks: VoiceRoutingBridgeSinks,
): { dispose: () => void; forwardAdapterFeedback: (session: SessionState) => void } {
  const removeTranscript = provider.onTranscript((transcript) => {
    if (transcript.final && transcript.text.trim()) void sinks.onTranscript(transcript);
  });
  const removeDiagnostics = provider.onDiagnostics?.((snapshot) =>
    sinks.onAudioDiagnostics?.(snapshot),
  );
  return {
    dispose: () => {
      removeTranscript();
      removeDiagnostics?.();
    },
    forwardAdapterFeedback: sinks.onAdapterFeedback,
  };
}
