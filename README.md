# Project Helix

Project Helix is the shared foundation for two products:

- **Helix Agent** — an artist-facing agent control and orchestration layer that turns production intent into safe, verifiable operations across existing DAWs and, eventually, Helix DAW.
- **Helix DAW** — our own agent-first DAW built specifically for artists and Helix Agents, with a native session model, audio runtime, project format, plugin/device model, and agent-native operations.

These products are related but not interchangeable. The current browser application is primarily the **Helix Agent** prototype. The `helix` host entry is currently a capability/design fixture for the future **Helix DAW**; it is not yet a native DAW runtime.

## Repository goals

- Keep the Helix engine/compiler independent from UI concerns.
- Treat protocol adapters and capability discovery as explicit boundaries.
- Keep deterministic intent compilation testable without a browser.
- Keep Helix Agent and Helix DAW boundaries explicit in code, docs, and tests.
- Keep generated/deployment artifacts out of source control.
- Use CI as the baseline gate for type safety, linting, tests, and production builds.

## Product and release plans

- [Product strategy and boundaries](docs/PRODUCTS.md)
- [v0.2.0 roadmap, readiness assessment, and exit criteria](docs/ROADMAP-v0.2.0.md)

The current baseline passes the repository test, typecheck, lint, and production-build gates. It is a strong Agent-oriented prototype foundation, not yet a full-featured Helix DAW or a production-ready cross-DAW integration release.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run dev
```

The application uses Vite + React + TanStack Router/Start, with the Helix domain logic under `src/lib/helix` and the UDAWCA layer under `src/lib/udawca`.
