# Voice Macros and Audio Diagnostics

## Custom voice macros

Artists can define a reusable alias from the Agent chat or booth microphone:

```text
Create voice macro “vocal lift” as “turn lead vocal up $1 dB”
vocal lift 2
```

The macro expands into one normal Helix command and then follows the existing compile, autonomy, approval, execution, verification, and ledger path. Positional arguments use `$1`, `$2`, and so on. Templates are bounded to one command and reject newlines or semicolon-separated command chains. Macro definitions are stored locally in `localStorage` for the browser prototype; native desktop hosts can provide a filesystem-backed store later.

The commands `list voice macros` and `delete macro vocal lift` manage the local catalog. Macros never bypass safety policy and are not allowed to execute arbitrary JavaScript or shell commands.

## Real-time audio diagnostics

The native booth provider now emits live diagnostics for input latency, processing time, scheduling jitter, estimated CPU load, buffer size, xruns, and dropouts. Healthy, degraded, and critical states are derived from the observed buffer cadence and processing pressure. Raw PCM remains transient and is not included in diagnostics or persisted by the provider.

The Agent accepts commands such as `check audio latency`, `inspect audio performance`, and `is the microphone healthy`. The native CLI also prints telemetry while running:

```bash
npm run voice:booth
```

A real device acceptance pass is still required on Windows/WASAPI, macOS/CoreAudio, and Linux/PipeWire or PulseAudio. The browser preview can display stored telemetry but cannot claim native device or round-trip output latency.
