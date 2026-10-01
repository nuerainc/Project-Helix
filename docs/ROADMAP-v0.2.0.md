# v0.2.0 Roadmap

## Release intent

v0.2.0 is the **two-product foundation release** for Project Helix. It should make the distinction between **Helix Agent** and **Helix DAW** executable in the architecture, product language, and test plan.

It is not a promise that a full commercial DAW ships in v0.2.0. A full-featured Helix DAW requires a real-time audio engine, durable project format, plugin/device hosting, and platform runtime work that is not present in the current browser prototype.

## Current baseline: 2026-09-30

The repository currently contains a polished browser-oriented prototype with:

- a Helix Agent-style intent surface (`Agent`, `Mixer`, `Surface`, `Ledger` views);
- deterministic local intent compilation for common production commands;
- operation planning, constraints, approval, rollback metadata, and verification labels;
- a capability registry for several existing DAWs plus a modeled `helix` host;
- UDAWCA compatibility code and server intent hooks;
- authentication, app-data, preview, migration, and deployment scaffolding;
- passing repository tests, typecheck, lint, and production build.

The current baseline does **not** yet contain:

- a real control adapter connected to an existing DAW;
- a native Helix DAW audio engine or real-time scheduler;
- a Helix DAW project file format and recovery path;
- plugin/device hosting;
- durable artist project persistence and media management;
- dedicated automated tests for the Helix compiler/engine/store behavior;
- browser-level acceptance tests for the primary agent workflows.

The `helix` host entry is therefore a capability contract and test fixture, not a functioning DAW runtime.

## Readiness assessment

These are directional engineering estimates against a **testable v0.2.0 foundation**, not a claim of percent-complete code.

| Product/workstream | Current readiness | Why |
|---|---:|---|
| Helix Agent interaction shell | ~70% | The core views and intent-to-plan workflow are present and manually exercisable. |
| Helix Agent domain safety model | ~55% | Constraints, capabilities, operation phases, approval, rollback metadata, and verification exist; dedicated domain coverage is missing. |
| Helix Agent real host connectivity | ~20% | Host capability declarations exist, but actual adapters and end-to-end control are not shipped. |
| Helix Agent persistence/auth/release | ~35% | Scaffolding is present, but durable project state, production connector configuration, and operational acceptance are incomplete. |
| Helix DAW runtime | ~10% | The native host is modeled in types and capability tables; no audio/runtime product exists yet. |
| Shared contracts and test fixtures | ~45% | Types and compatibility layers exist, but the product split and contract-test package are not established. |

**Bottom line:** Helix Agent is roughly halfway to a credible, testable v0.2.0 foundation. The combined two-product repository is roughly **35–45%** of that foundation. Helix DAW itself is at the architecture/prototype stage, not close to a full-featured DAW release.

## v0.2.0 definition of done

### Track A — Product and architecture split

- [ ] Adopt explicit product labels in UI, README, issue templates, and release notes.
- [ ] Establish shared domain ownership separate from product UI ownership.
- [ ] Define `Helix Agent` and `Helix DAW` runtime boundaries in code and documentation.
- [ ] Keep the modeled Helix host clearly marked as simulated until a real runtime exists.
- [ ] Add a product matrix mapping every feature to Agent, DAW, or Shared.

### Track B — Helix Agent vertical slice

- [ ] Support a complete inspect → propose → approve/skip → commit → verify → undo flow with a deterministic fixture.
- [ ] Add a real adapter contract with one executable adapter or loopback host, not only capability declarations.
- [ ] Make capability negotiation choose native, plugin bridge, or human-assisted execution and expose the reason.
- [ ] Persist session identity, operation ledger, and safe rollback state across reloads.
- [ ] Define behavior for unavailable, stale, partial, and conflicting host state.
- [ ] Add browser acceptance coverage for the primary artist workflows.

### Track C — Helix DAW foundation

- [ ] Create a separate DAW runtime package/application boundary.
- [ ] Define the first native session model: project, tracks, clips, takes, routing, transport, and automation.
- [ ] Implement a deterministic offline runtime/clock fixture that can be tested without real audio hardware.
- [ ] Provide native command execution against that fixture with operation IDs and verification.
- [ ] Save and restore a versioned project document with migration and recovery tests.
- [ ] Demonstrate one artist workflow end to end inside the native fixture, such as record/take selection or edit/mix/verify.

This track is a **foundation**, not the full DAW feature set. Plugin hosting, low-latency audio I/O, broad platform support, and production-grade media management remain later milestones unless explicitly added to the release scope.

### Track D — Test and release gate

- [ ] Add unit tests for compiler intent coverage, engine planning, constraints, verification, ledger, and store transitions.
- [ ] Add shared contract tests that run against both a loopback host and the Helix DAW fixture.
- [ ] Add browser acceptance tests for Agent and the first DAW fixture workflow.
- [ ] Test stale state, refused operations, partial execution, undo, reload, and project migration.
- [ ] Publish a capability matrix that distinguishes exact, high, coarse, human-assisted, and unsupported behavior.
- [ ] Require `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` in CI.

## Recommended sequencing

1. **Product language and shared contracts** — remove ambiguity before adding more UI.
2. **Deterministic test fixtures** — make the Agent and DAW behavior testable without external DAWs or audio hardware.
3. **Helix Agent vertical slice** — ship one real adapter/loopback path through inspect, execute, verify, and undo.
4. **Helix DAW native fixture** — introduce the first native project/session runtime behind a separate boundary.
5. **Persistence and browser acceptance** — prove reload, recovery, and artist workflows.
6. **Release hardening** — capability matrix, CI, migrations, and explicit known limitations.

## Out of scope for v0.2.0 unless separately approved

- A complete commercial replacement for every major DAW.
- Full VST/AU/AAX plugin compatibility.
- Production low-latency audio drivers for every desktop OS.
- Cloud collaboration, marketplace, or broad third-party extension ecosystem.
- Claims that the current browser `helix` host is already Helix DAW.

## Exit statement

v0.2.0 is ready when an evaluator can distinguish the two products, run a fully tested Helix Agent vertical slice against a deterministic host, run the first native Helix DAW fixture workflow, reload both states safely, and see truthful capability/verification results. Passing unit tests alone is not sufficient.
