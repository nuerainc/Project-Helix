# Contributing to Project Helix

## Workflow

1. Create a focused branch from `main`.
2. Keep protocol/domain logic separate from UI changes.
3. Add or update tests for behavioral changes.
4. Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` before opening a PR.
5. Keep generated build, deployment, and local workspace artifacts out of commits.

## Product labeling

Every feature proposal and pull request must identify its product ownership as **Helix Agent**, **Helix DAW**, or **Shared**. Do not describe the modeled `helix` host as a functioning DAW until the native runtime, project persistence, and audio behavior exist and are tested. See [`docs/PRODUCTS.md`](docs/PRODUCTS.md) and [`docs/ROADMAP-v0.2.0.md`](docs/ROADMAP-v0.2.0.md).

Through v0.4.0, new product work should improve Helix Agent interoperability, platform agnosticism, safety, or testability. Helix DAW implementation is deferred; record DAW requests against the locked v1.0.0 target in [`docs/RELEASE-PLAN.md`](docs/RELEASE-PLAN.md) instead of adding them to an Agent release.

## Commit style

Use concise, imperative commit messages, e.g. `Add capability negotiation to Helix engine`.

## Architecture rule

Changes to the Helix compiler/engine should remain deterministic and independently testable. UI code should consume domain types and compiled intents rather than duplicating protocol logic.
