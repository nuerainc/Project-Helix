# Project Helix

Project Helix is a browser-based control and orchestration environment for a universal DAW/control-surface architecture, built around a protocol-first abstraction layer and UDAWCA integration.

## Repository goals

- Keep the Helix engine/compiler independent from UI concerns.
- Treat protocol adapters and capability discovery as explicit boundaries.
- Keep deterministic intent compilation testable without a browser.
- Keep generated/deployment artifacts out of source control.
- Use CI as the baseline gate for type safety, linting, tests, and production builds.

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
