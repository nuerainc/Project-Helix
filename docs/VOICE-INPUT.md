# Helix Agent Voice Input

## Scope decision

Voice input is an **Agent capability**, not a Helix DAW implementation. It turns spoken production intent into the existing Helix intent/compiler pipeline:

```text
microphone → voice provider → transcript → intent compiler → plan → policy/approval → execute → verify → ledger
```

Voice never bypasses autonomy, capability negotiation, safety constraints, approval gates, verification, or rollback.

## Platform targets

The production Agent runtime targets:

- **Windows:** native capture through WASAPI;
- **macOS:** native capture through CoreAudio;
- **Linux:** native capture through PipeWire/PulseAudio.

The desktop provider must support push-to-talk and explicit continuous booth listening, with local voice activity detection and local transcription where the selected provider supports it. A provider must expose microphone/device selection, permission state, listening state, interruption/stop, final/interim transcripts, and actionable errors.

The first native runtime slice is now implemented behind the platform-neutral contract:

- `native-voice-provider.server.ts` owns permission, device selection, push-to-talk/continuous lifecycle, VAD gating, transcript events, device-loss state, and immediate stop;
- `createProcessAudioCapture` launches a platform capture backend using WASAPI-compatible `ffmpeg` on Windows, CoreAudio-compatible `ffmpeg` on macOS, and PipeWire/PulseAudio `parec` on Linux;
- `createLocalCommandTranscriber` pipes in-memory WAV PCM to an installed local recognizer such as `whisper-cli`; raw audio is discarded after each call;
- `npm run voice:booth` is the desktop smoke-test entrypoint. Set `HELIX_MIC_DEVICE`, `HELIX_TRANSCRIBER_COMMAND`, and `HELIX_TRANSCRIBER_ARGS` when the default tools are not appropriate.

Example:

```shell
HELIX_TRANSCRIBER_COMMAND=whisper-cli \
HELIX_TRANSCRIBER_ARGS='--stdin --no-timestamps --language en' \
npm run voice:booth
```

Use `npm run voice:booth -- --push-to-talk` for one-shot capture mode. Continuous mode is explicit and remains active only until the artist stops it or the process receives Ctrl+C.

The production default is **no audio persistence**. Raw audio is not uploaded or retained unless a separately approved product feature adds that behavior with an explicit policy and visible user consent.

## Routing and track-feedback integration

Final transcripts from the native booth provider are forwarded through the same intent/compiler pipeline as typed prompts. A phrase such as `send guitar left to guitar bus at -3 dB` becomes a reviewed `set_send` operation; voice does not bypass autonomy, routing constraints, approval, execution, or verification.

The shared [`voice-routing-bridge.ts`](../src/lib/helix/voice-routing-bridge.ts) connects final native transcripts to the Agent submit sink and forwards native adapter snapshots to the store's `receiveAdapterFeedback` sink. HUI feedback can therefore update send levels, left/right meters, fader state, and the Agent's voice-routing confirmation panel. The bridge ignores interim transcripts so partial speech is never executed.

## Browser preview boundary

The current TanStack/React application is a browser prototype. Its Web Speech API integration is a **preview adapter only**:

- it is not the production desktop voice provider;
- it may vary by browser and may use a browser-managed remote speech service;
- it cannot establish the Windows/macOS/Linux device, latency, privacy, or wake-word guarantees;
- it must remain clearly labeled as browser preview behavior;
- its final transcripts still enter the normal Agent chat submission path.

The browser preview exists to validate chat interaction and transcript-to-intent behavior while the desktop runtime is designed. It must not be described as cross-platform native voice support.

## Release alignment

### v0.3.0 — Adapter ecosystem

- Stabilize the platform-neutral `VoiceInputProvider` contract.
- Add provider capability negotiation for push-to-talk, continuous listening, local transcription, VAD, wake word, and device selection.
- Add simulator/conformance fixtures for interim/final transcripts, permission denial, device loss, interruption, and stale provider state.
- Keep browser speech as a preview adapter; do not treat it as the desktop implementation.

### v0.4.0 — Production beta

- Package the desktop voice provider for Windows, macOS, and Linux.
- Add OS permission diagnostics, microphone/device selection, reconnect/recovery, and visible listening indicators.
- Add failure-injection coverage for device disconnect, provider crash, transcription timeout, and interrupted continuous listening.
- Verify that every transcript follows the same plan/approval/verification/ledger path as typed input.

## Acceptance criteria

- The same spoken transcript produces the same intent and safety behavior as typed text.
- Continuous listening is explicitly enabled by the artist, visibly active, and immediately stoppable.
- No transcript is committed as a mutating operation without the normal Agent lifecycle.
- Provider capability/precision state is visible when a feature is unavailable.
- Mic permission denial, device loss, unsupported platform, and transcription errors produce human-readable recovery steps.
- No raw audio is stored or uploaded by default.
- Browser preview behavior is never used as evidence that native Windows, macOS, or Linux voice support is complete.
- Native microphone capture is not tested against physical booth hardware in the sandbox; the updated Manus Desktop connection is required for OS permission, device enumeration, and Pro Tools booth validation.
