# Project Helix Agent Guide

## Architecture

- `src/lib/helix/`: core Helix domain, intent compilation, sessions, hosts, and formatting.
- `src/lib/udawca/`: Universal DAW Control Architecture integration.
- `src/components/helix/`: application UI.
- `src/store/`: client state.
- `src/routes/`: application routes.
- `scripts/`: development, migration, validation, and smoke-test utilities.

## Rules

- Preserve the separation between domain/compiler code and presentation code.
- Prefer existing domain types and utilities over parallel representations.
- Add tests for changes to compiler, intent, session, auth, and protocol behavior.
- Never commit secrets, local environment files, generated deployment output, or Grok workspace metadata.
- Keep changes small and reviewable.
