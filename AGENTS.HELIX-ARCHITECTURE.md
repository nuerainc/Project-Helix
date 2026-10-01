# Project Helix Agent Guide

## Architecture

- **Helix Agent:** the artist-facing orchestration product for existing DAWs and Helix DAW.
- **Helix DAW:** our own agent-first DAW for artists and Helix Agents; its native runtime is not implemented yet.
- **Shared:** domain contracts, capabilities, intents, operation lifecycle, verification, constraints, and ledger semantics.
- `src/lib/helix/`: core Helix domain, intent compilation, sessions, hosts, and formatting.
- `src/lib/udawca/`: Universal DAW Control Architecture integration.
- `src/components/helix/`: application UI.
- `src/store/`: client state.
- `src/routes/`: application routes.
- `scripts/`: development, migration, validation, and smoke-test utilities.

## Rules

- Preserve the separation between domain/compiler code and presentation code.
- Label work as Agent, DAW, or Shared before implementation; do not collapse the two products into one implied runtime.
- Treat `host: "helix"` as a capability/design fixture until a real Helix DAW runtime exists.
- Prefer existing domain types and utilities over parallel representations.
- Add tests for changes to compiler, intent, session, auth, and protocol behavior.
- Never commit secrets, local environment files, generated deployment output, or Grok workspace metadata.
- Keep changes small and reviewable.
