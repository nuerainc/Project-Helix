# Helix Release Plan

**Status:** Planning baseline to lock the intended product scope.  
**Planning horizon:** Helix Agent v0.2.0, v0.3.0, v0.4.0, and v1.0.0; Helix DAW v1.0.0 target.  
**Current strategy:** Ship interoperability first. Do not implement Helix DAW features during the v0.2.0–v0.4.0 window.

## Product strategy

Project Helix has two products, but the near-term product investment is intentionally one-sided:

- **Helix Agent** is the active product. It is a platform-agnostic control, orchestration, safety, and verification layer for artists and Helix Agents working across existing DAWs, control surfaces, plugin bridges, files, and eventually Helix DAW.
- **Helix DAW** is our planned first-party agent-first DAW for artists and Helix Agents. Its v1.0.0 feature set is locked here for architectural direction, but implementation is parked until after the Agent interoperability releases.

The Agent must not depend on Helix DAW to be useful. Helix DAW must eventually implement the same shared contracts as a first-class native host, not receive a special shortcut through the Agent.

## Scope guardrails

The following rules govern the three pre-1.0 Agent releases:

1. **Interoperability over proprietary depth.** Prefer portable contracts, adapters, capability negotiation, and truthful fallbacks over deep work on one host.
2. **Platform agnosticism.** The core Agent must run on macOS, Windows, and Linux. Host support is expressed as a capability matrix, not as a binary compatible/incompatible badge.
3. **No Helix DAW implementation through v0.4.0.** We may maintain types, fixtures, and architectural documentation needed for shared contracts, but we will not build the Helix DAW audio engine, native editor, project runtime, plugin host, or DAW UI in these releases.
4. **No silent claims.** Every operation reports whether it is exact, high-confidence, coarse, human-assisted, refused, or unsupported.
5. **Every destructive path is inspectable.** Plans, constraints, approvals, diffs, verification, and rollback behavior are part of the product, not optional UI polish.
6. **Shared contracts are versioned.** Intent, capability, session snapshot, operation, verification, and ledger schemas need compatibility tests before adapters multiply.

## Release matrix

| Capability | v0.2.0 Interoperability Core | v0.3.0 Adapter Ecosystem | v0.4.0 Production Beta | v1.0.0 Helix Agent |
|---|---|---|---|---|
| Product identity | Helix Agent clearly separated from parked Helix DAW | Same | Same | Stable product and support boundaries |
| Core runtime | Cross-platform browser/desktop-compatible core and deterministic loopback host | Packaged adapter runtime and SDK | Production packaging and upgrade path | Supported releases on macOS, Windows, Linux |
| Session model | Versioned session snapshot for tracks, transport, mixer state, takes, and findings | Portable session graph with partial-state/conflict markers | Large-session performance and migration guarantees | Stable semantic session graph and compatibility policy |
| Intent | Deterministic local compiler plus provider fallback with schema validation | Extensible intent vocabulary and locale-safe aliases | Confidence calibration and regression corpus | Stable intent API and versioned provider contract |
| Capabilities | Discovery, negotiation, precision tiers, and refusal reasons | Adapter-declared capabilities with health/version checks | Runtime capability changes, conflict detection, and recovery | Stable capability registry and support matrix |
| Execution | Inspect → propose → approve/skip → commit → verify → undo | Queued/batched operations, idempotency, retry, and partial-result handling | Offline queue, reconciliation, audit export, and recovery | Durable operation protocol with predictable semantics |
| Safety | Constraints, autonomy levels, dry run, diff preview, approval gate, rollback metadata | Per-host policy profiles and safe defaults | Team/project policy, approval history, and incident diagnostics | Auditable safety model suitable for production use |
| Interoperability | Protocol-neutral adapter boundary plus loopback/reference adapter | MIDI/MCU/HUI, OSC, HTTP/WebSocket, file, and plugin-bridge adapter contracts | SDK, conformance suite, adapter health, and compatibility tooling | Broad supported host matrix with tiered guarantees |
| Artist workflows | Inspect, gain, mute/solo, arm, transport, bank, rename, safe fixes, takes, automation intent | Routing, clip/take operations, organization, analysis, and batch workflows where host allows | Cross-host workflow templates and reliable recovery | Full supported Agent workflow vocabulary |
| Ledger/verification | Semantic ledger, evidence, verification classes, undo | Durable history and portable audit records | Exportable audit/review package and conflict explanations | Stable provenance and verification API |
| Persistence | Reload-safe Agent state and schema migrations | Project/session persistence independent of host | Backup/restore and crash/recovery tests | Production data lifecycle and compatibility guarantees |
| Testability | Domain tests plus deterministic loopback contract tests | Adapter conformance tests and browser acceptance | Cross-platform matrix, soak, failure-injection, and performance gates | Release certification for supported combinations |

## Helix Agent v0.2.0 — Interoperability Core

**Release promise:** An evaluator can use Helix Agent against a deterministic loopback host and one reference adapter, understand exactly what the connected host can do, approve safe work, verify the result, and undo it without relying on Helix DAW.

### Ship features

- Product-level Helix Agent naming and separation from Helix DAW.
- Versioned shared schemas for session snapshots, capabilities, intents, constraints, operations, findings, verification, and ledger entries.
- Deterministic local intent compilation for the initial vocabulary: inspect, transport, bank, gain, mute, solo, arm, rename, safe fix, undo, take organization, silence trim, and chorus automation.
- Provider-backed intent compilation only behind schema validation, confidence thresholds, and an `unknown` fallback.
- Capability discovery and negotiation with explicit mechanism selection: native, plugin bridge, file, control surface, human-assisted, or unsupported.
- Full operation lifecycle: inspect → propose → approve/skip → commit → verify → undo.
- Dry-run and diff preview for every mutating operation.
- Constraints for gain deltas, deletion, routing, plugin insertion, automation, and backup requirements.
- Semantic ledger with evidence, operation IDs, before/after values, rollback availability, and refusal reasons.
- A deterministic loopback host and one reference adapter implementing the shared contract.
- Initial protocol-neutral adapter boundary, with transport-independent messages and no UI-level protocol branching.
- Reload-safe Agent state for session identity, pending operations, ledger, and schema migration.
- Unit tests for compiler, engine, constraints, verification, ledger, and store transitions.
- Browser acceptance tests covering the primary inspect/plan/approve/verify/undo artist path.

### v0.2.0 exit gates

- No operation can commit without a plan and policy decision.
- A capability mismatch produces a truthful refusal or human step, never a fabricated success.
- The loopback and reference adapter pass the same contract suite.
- State survives reload and migration tests without losing operation history.
- `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` pass in CI on the supported core runtime.

## Helix Agent v0.3.0 — Adapter Ecosystem

**Release promise:** Helix Agent can interoperate with a meaningful cross-platform set of existing DAWs and integration mechanisms through a documented adapter SDK, while preserving capability truth and safety semantics.

### Ship features

- Public internal adapter SDK with lifecycle, discovery, health, capabilities, snapshots, execution, verification, and teardown interfaces.
- Conformance suite and adapter simulator so new integrations can be tested without a live DAW.
- Generic MIDI, Mackie Control/MCU, HUI, OSC, HTTP/WebSocket, file, and plugin-bridge transport contracts where applicable.
- Reference adapters for at least one cross-platform host and one protocol-only integration. The initial target matrix should prioritize REAPER, Bitwig, and a generic MIDI/OSC path because they provide broad platform coverage.
- First-class adapter health, version, permissions, latency, stale-state, and reconnect reporting.
- Idempotent operation keys, retry policy, queued/batched operations, cancellation, timeout, and partial-result handling.
- Expanded Agent workflows: routing/sends, clip and take operations, track organization, audio-analysis findings, batch fixes, and host-specific automation where capabilities allow.
- Portable session graph with explicit unknown/partial/conflicted values instead of destructive normalization.
- Durable audit history with export/import for review and support diagnostics.
- Project and host policy profiles that control autonomy, precision requirements, backup rules, and allowed operation classes.
- Browser acceptance coverage for adapter selection, reconnect, stale state, partial execution, refusal, and recovery.
- Cross-platform CI for core packages and adapter simulators on macOS, Windows, and Linux.

### v0.3.0 exit gates

- Adding an adapter does not require changes to the Agent UI or core compiler.
- Every supported adapter advertises a machine-readable capability/precision matrix and passes conformance tests.
- A disconnected or stale host cannot be mistaken for a successful commit.
- The same Agent workflow produces a comparable ledger across at least two different integration mechanisms.
- The Agent core remains functional when no external host is available.

## Helix Agent v0.4.0 — Production Beta

**Release promise:** Helix Agent is a dependable beta product for artists and Helix Agents using supported existing DAWs, with predictable recovery, portability, support diagnostics, and a clear capability matrix.

### Ship features

- Production packaging for macOS, Windows, and Linux with signed/reproducible release artifacts where the distribution channel supports them.
- Supported-host matrix covering the initial cross-platform reference hosts plus tiered adapters for Logic Pro, Cubase, Pro Tools, Studio One, Ableton Live, and FL Studio where their public or bridge surfaces permit it.
- Capability tiers: exact, high, coarse, human-assisted, unsupported, and experimental, with user-visible explanations.
- Adapter install/update/disable flow, compatibility checks, permissions diagnostics, and safe rollback of adapter versions.
- Offline queue and reconciliation for disconnected hosts, with explicit conflict review before commit.
- Project/session backup, restore, migration, crash recovery, and corruption detection.
- Multi-operation workflows with dependency ordering, transaction boundaries, cancellation, and partial recovery.
- Performance budgets for large sessions, large ledgers, high-frequency metering, and reconnect storms.
- Accessibility and keyboard-first Agent workflows for common artist actions.
- Redacted diagnostic bundle export containing capabilities, versions, operation IDs, failures, and verification evidence without secrets or media.
- Security hardening for local bridges, origin checks, credentials, permission scopes, and untrusted adapter input.
- Full browser acceptance, failure-injection, cross-platform, and upgrade/migration test gates.

### v0.4.0 exit gates

- Each supported host has a published support tier and tested known limitations.
- A user can recover from adapter disconnect, stale state, failed operation, interrupted update, and app restart without losing the audit trail.
- No core Agent feature requires Helix DAW or a proprietary host file format.
- Diagnostic output is sufficient to reproduce or triage adapter failures without collecting user secrets or audio.
- Beta release criteria are green on all three core operating systems.

## Helix Agent v1.0.0 — Locked feature set

The v1.0.0 Agent is a stable interoperability product, not a replacement DAW. Its locked feature set includes:

- Cross-platform Agent runtime on macOS, Windows, and Linux.
- Stable versioned intent, capability, session, operation, verification, ledger, and adapter SDK contracts.
- Supported adapters across native APIs, plugin bridges, MIDI/MCU/HUI, OSC, HTTP/WebSocket, and file workflows, with published per-host guarantees.
- Host discovery, health, permissions, reconnect, stale-state detection, capability negotiation, and graceful human-assisted fallbacks.
- Natural-language and structured command input with deterministic compilation, provider validation, confidence thresholds, and unknown-intent safety.
- Session inspection and semantic graph operations covering transport, tracks, gain, pan, mute, solo, arm, routing, clips, takes, automation, organization, analysis, and supported repair workflows.
- Safety/autonomy policies, dry runs, diffs, approval gates, backup requirements, idempotency, cancellation, retries, partial execution, conflict review, rollback, and recovery.
- Durable semantic ledger, evidence, provenance, verification, audit export/import, and support diagnostics.
- Portable project/session snapshots, migrations, backup/restore, and crash recovery without requiring a Helix DAW project file.
- Adapter SDK, simulator, conformance suite, compatibility matrix, and cross-platform release certification.
- Accessibility, keyboard-first workflows, secure local bridge behavior, privacy controls, and documented data lifecycle.

A v1.0.0 Agent release does not claim that every operation is exact on every host. It claims that the Agent always tells the truth about the available mechanism and precision.

## Helix DAW v1.0.0 — Locked feature set, implementation parked

No Helix DAW feature implementation is planned in v0.2.0, v0.3.0, or v0.4.0. The following is the **locked target feature set** to guide shared contracts and prevent accidental scope drift when DAW work resumes:

- Native real-time audio engine, transport clock, monitoring, latency compensation, and offline render.
- Durable, versioned project format with atomic save, autosave, crash recovery, migration, and portable media references.
- Artist-first session model for tracks, folders, buses, sends, returns, clips, takes, comping, markers, tempo, time signatures, and automation.
- Non-destructive editing and mixing workflows with precise undo/redo and semantic history.
- Native routing, gain, pan, mute, solo, arm, automation, metering, analysis, and render/export operations.
- VST3 and platform-appropriate plugin/device hosting with sandboxing, scanning, preset/state persistence, latency reporting, and failure recovery. Additional formats require a separate compatibility decision.
- Agent-native command, plan, permission, verification, ledger, and explainability model using the shared Helix contracts.
- First-class human/Agent collaboration: visible intent, proposed changes, approval, interruption, handoff, and audit history.
- Controller and extension surfaces for MIDI, MCU/HUI, OSC, and a documented Helix native API.
- Import/export interoperability for common audio, MIDI, stems, and agreed exchange formats, with explicit fidelity limits.
- Cross-platform desktop distribution on macOS, Windows, and Linux, with hardware capability checks and safe fallback modes.
- Artist UX for recording, editing, arranging, mixing, monitoring, take review, project organization, and delivery.
- Accessibility, localization-ready UI, crash reporting controls, privacy settings, and secure extension boundaries.
- Automated real-time, audio correctness, project migration, plugin compatibility, recovery, performance, and Agent contract tests.

The v1.0.0 DAW target is intentionally ambitious. Locking this feature set does not change the current decision to invest only in Helix Agent interoperability through v0.4.0.

## Scope change policy

This document is the planning baseline. During v0.2.0–v0.4.0, additions should be accepted only when they improve Helix Agent interoperability, platform agnosticism, safety, testability, or release reliability. Helix DAW implementation requests should be recorded as deferred v1 work, not quietly added to an Agent milestone.
