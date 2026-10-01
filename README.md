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
- [Locked v0.2.0–v1.0.0 release feature plan](docs/RELEASE-PLAN.md)
- [Cross-platform voice-input scope](docs/VOICE-INPUT.md)
- [Voice-triggered session backup and recovery](docs/SESSION-BACKUP-RECOVERY.md)
- [Native durable project-state layer](docs/NATIVE-PROJECT-STATE.md)
- [Custom voice macros and audio diagnostics](docs/VOICE-MACROS-AUDIO-DIAGNOSTICS.md)
- [Pro Tools HUI adapter implementation](docs/PROTOOLS-HUI.md)
- [Mackie Control Universal adapter implementation](docs/MCU.md)
- [Experimental OSC adapter implementation](docs/OSC.md)

The current baseline passes the repository test, typecheck, lint, and production-build gates. Active delivery is focused on Helix Agent interoperability and platform agnosticism through v0.4.0; Helix DAW implementation is parked while its v1.0.0 feature set remains locked in the release plan.

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
