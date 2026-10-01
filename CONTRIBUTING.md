# Contributing to Project Helix

## Workflow

1. Create a focused branch from `main`.
2. Keep protocol/domain logic separate from UI changes.
3. Add or update tests for behavioral changes.
4. Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` before opening a PR.
5. Keep generated build, deployment, and local workspace artifacts out of commits.

## Commit style

Use concise, imperative commit messages, e.g. `Add capability negotiation to Helix engine`.

## Architecture rule

Changes to the Helix compiler/engine should remain deterministic and independently testable. UI code should consume domain types and compiled intents rather than duplicating protocol logic.
