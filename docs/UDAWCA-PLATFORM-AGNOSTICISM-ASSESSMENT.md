# UDAWCA Platform-Agnosticism Assessment

**Assessment date:** 2026-10-01  
**Scope:** Agent Universal DAW Control Architecture (UDAWCA), native adapters, protocol boundary, and the eight previously failing repository tests.

## Executive summary

The UDAWCA design is **architecturally platform-agnostic, but not yet operationally platform-independent**.

- **Core boundary:** strong. `HelixAdapter`, injected `NativeMidiPort`, injected `OscTransport`, protocol codecs, capability graphs, refusal semantics, and verification states keep most domain logic independent of operating system and hardware.
- **Current implementation:** partial. The native transport is Node-only, depends on a compiled `midi`/RtMidi addon, and requires OS-specific backend setup. The browser Agent does not yet instantiate a live adapter.
- **Host abstraction:** incomplete. HUI, MCU, and OSC adapters all currently obtain `hostById("protools")`; MCU and OSC are therefore reported with Pro Tools capabilities even though their wire protocols are host-neutral or profile-dependent.
- **Evidence level:** good deterministic unit coverage, but no committed cross-platform CI matrix, packaging contract, native-device smoke tests, or adapter conformance suite.

**Overall rating: 6/10 — good separation of concerns and honest capability/refusal behavior, but not ready to claim certified cross-platform interoperability.**

## What caused the eight failures

The archive omitted `.grok/`, which is intentionally ignored by the repository. Four tests expected the platform-provided OG skill documentation, and four expected the platform-provided `.grok/app-env.json` default:

| Test group | Failure cause | Corrective action |
|---|---|---|
| `brand-check.test.mjs` | Missing `.grok/skills/og/SKILL.md` | Restored a minimal, non-secret checked-in contract fixture |
| `write-atomic.test.mjs` | Missing `.grok/skills/og/references/*` | Restored the documented OG hand-over recipes |
| `with-app-env.test.mjs` | Missing `.grok/app-env.json` | Restored the explicit `VITE_AUTH_ENABLED=false` fixture |
| `check-auth-invariant.test.mjs` | Same missing app-env fixture | Resolved automatically by the same fixture |

The fixtures are deliberately minimal and contain no credentials or platform-private implementation. `.gitignore` now keeps broad `.grok` ignores while allowing only these specific files.

## Evidence for platform agnosticism

### 1. Stable adapter contract — strong

`src/lib/udawca/adapter.ts` defines a protocol-neutral `HelixAdapter` with:

- discovery and capability reporting;
- connect/disconnect lifecycle;
- health and stale-state reporting;
- session snapshots;
- cancellable execution;
- explicit `committed`, `partial`, `refused`, `failed`, and `cancelled` results;
- verification with `pass`, `fail`, and `not_observable`.

UI and compiler code can depend on this contract rather than a specific DAW or protocol. This is the correct architectural seam.

### 2. Transport dependency injection — strong

The HUI and MCU adapters accept a `NativeMidiPort`; the OSC adapter accepts an `OscTransport`. Tests use fake transports and do not require physical devices. This isolates protocol and state behavior from the OS transport implementation.

The protocol codecs (`hui-protocol.ts`, `mcu-protocol.ts`, `osc-protocol.ts`) are pure data transformations and are the most portable part of the layer.

### 3. Capability truth and refusal behavior — good

The adapters refuse unsupported operations instead of reporting false commits. They also expose coarse precision and `not_observable` verification where the protocol cannot prove exact host state. This is especially important for HUI, which cannot provide a universal byte-level route or plugin-parameter API.

### 4. Protocol coverage — promising but profile-limited

The registry covers HUI, MCU, and experimental OSC. HUI/MCU use native MIDI and OSC uses UDP. The documented intent is cross-platform operation on Windows, macOS, and Linux, and the underlying RtMidi approach is compatible with those operating systems when their native MIDI backends and development prerequisites are installed.

## Gaps and risks

### P0 — Host capability is hard-coded to Pro Tools

`hui-midi-adapter.server.ts`, `mcu-midi-adapter.server.ts`, and `osc-adapter.server.ts` each call `hostById("protools")`; their descriptors also advertise `host: "protools"`.

This creates a correctness problem:

- MCU is documented as reusable for any host exposing an MCU endpoint, but it receives Pro Tools capabilities.
- OSC is explicitly profile-dependent, but it receives Pro Tools capabilities and a Pro Tools-shaped session model.
- A connected REAPER, Logic, Ableton, or custom OSC endpoint can therefore be planned against the wrong native/plugin/file capabilities.

**Recommended fix:** make host identity a required adapter configuration or a separate host-profile resolver. Use a discriminated configuration such as `{ protocol: "MCU", host: "reaper", ... }`, and reject creation when the selected host/protocol combination is not declared compatible. Keep wire-protocol adapters independent from host capability graphs.

### P0 — OSC is a Helix profile, not general DAW OSC interoperability

The OSC adapter sends `/helix/...` addresses. That is valid for a Helix-defined endpoint, but it is not automatically compatible with Ableton Live, REAPER, Bitwig, or another DAW’s proprietary OSC namespace.

**Recommended fix:** introduce explicit OSC host profiles containing address maps, argument types, feedback mappings, and verification guarantees. Mark the generic adapter as `profile-required` rather than broadly host-compatible.

### P1 — “Implemented on all platforms” is declarative, not certified

`AdapterDescriptor.platforms` and `ProtocolDescriptor.platforms` statically list Windows, macOS, and Linux. There is no runtime backend check, platform capability probe, or CI matrix in the repository. There is also no `.github` workflow present in the cloned tree.

**Recommended fix:** separate:

- `supportedPlatforms` — intended support;
- `available` — detected on this machine;
- `backend` — ALSA/JACK/CoreMIDI/Windows multimedia/etc.;
- `limitations` — permissions, device access, or missing headers.

Add CI jobs for Linux, macOS, and Windows covering pure codecs, simulators, typecheck, lint, and native transport loading. Keep physical-device tests as opt-in hardware jobs.

### P1 — Native runtime is Node/desktop-only

The live creators dynamically import `midi` and `node:dgram`. This is correct for a desktop/server provider but cannot run in the browser preview. The current docs correctly state that the browser UI does not claim live MIDI/UDP control.

**Recommended fix:** make the runtime split explicit in types and packaging:

- browser-safe core package: contracts, codecs, capability model, simulators;
- desktop transport package: RtMidi and Node UDP providers;
- host bridge: selects and injects a live adapter into the Agent runtime.

Do not allow server-only adapter modules to enter the browser bundle.

### P1 — Native build prerequisites are not documented as install automation

The `midi` dependency compiles a native addon. Linux needed `libasound2-dev` in this validation environment. macOS and Windows have different backend/toolchain requirements.

**Recommended fix:** document prerequisites per OS, add a diagnostics command that reports missing native backends, and make installation fail with an actionable message rather than a generic `node-gyp` error. Consider an optional native dependency or prebuilt release strategy for packaged desktop builds.

### P1 — Adapter factory typing is too permissive

`createNativeAdapter()` accepts a union of all config types and uses casts based on the protocol string. Invalid combinations can compile and fail only at runtime.

**Recommended fix:** use a discriminated union keyed by protocol and host, or separate factory functions with typed configs. Add tests for invalid protocol/config combinations.

### P2 — Verification currently overclaims on some paths

HUI and MCU verification can return `pass` when the transport is connected even when the protocol only provides coarse or absent host-state feedback. OSC explicitly says exact state depends on the configured profile, but still returns `pass` for a connected transport.

**Recommended fix:** distinguish transport acknowledgement from host-state verification. Return `not_observable` or a separate `transport_acknowledged` status unless the adapter has correlated feedback for the specific change.

### P2 — Session model and banking are shared assumptions

All three adapters use an eight-zone mixer and map track IDs into a local bank. That is a useful reference surface, but not universal: hosts differ in master-channel placement, track visibility, sends, fader curves, feedback cadence, and channel counts.

**Recommended fix:** move surface layout into the discovered capability/profile result, including zone count, master position, fader encoding, bank semantics, and feedback guarantees.

## Current maturity by layer

| Layer | Rating | Assessment |
|---|---:|---|
| Pure protocol codecs | 8/10 | Deterministic and well-tested; mostly OS-independent |
| Adapter contract | 8/10 | Clear lifecycle, refusal, cancellation, and verification boundary |
| Simulator/reference adapter | 7/10 | Useful for UI and conformance, but HUI/Pro Tools named and intentionally limited |
| Native MIDI transport | 5/10 | Cross-platform in principle through RtMidi; runtime prerequisites and discovery are incomplete |
| OSC transport | 5/10 | Portable UDP foundation; host profile compatibility is not implemented |
| Host capability mapping | 4/10 | Rich matrix exists, but live adapters currently bind to Pro Tools capabilities |
| Browser-to-desktop integration | 3/10 | Contract exists, but live adapter injection into the Agent UI is still pending |
| Cross-platform release evidence | 2/10 | No committed OS matrix, packaging checks, or hardware certification |

## Recommended next sequence

1. **Separate protocol adapters from host profiles.** Make host/profile explicit in factory inputs and descriptor output.
2. **Add an adapter conformance suite.** Run the same lifecycle, refusal, cancellation, partial-result, and verification tests against simulator, HUI, MCU, and OSC profile adapters.
3. **Add runtime diagnostics.** Report OS, native MIDI backend, enumerated ports, UDP bind errors, and permission state.
4. **Add CI matrix coverage.** Run portable tests on Linux/macOS/Windows; run native-load tests where the backend is available.
5. **Implement one real reference host profile.** REAPER or Bitwig is a better first reference for semantic control than assuming every MCU endpoint has Pro Tools capabilities.
6. **Keep the browser claim narrow.** The browser Agent can plan and display operations; only the desktop host bridge should claim live control.

## Validation after the fixture repair

The full `npm test` command now passes:

- script tests: **195 passed**;
- TypeScript/domain tests: **98 passed**;
- failures: **0**.

The previous typecheck, lint, and production-build gates also passed after installing the Linux ALSA development headers required by the native MIDI addon.
