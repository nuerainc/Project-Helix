# Helix Products

Project Helix is the shared foundation for **two related products**. They are not two names for the same application.

## Helix Agent

**Helix Agent** is the artist-facing agent control and orchestration product.

It helps an artist or Helix Agent:

- express production intent in natural language;
- inspect a session and surface measurable findings;
- compile intent into deterministic operations;
- select the strongest available mechanism for the connected host;
- require approval according to an autonomy policy;
- execute safely, verify the result, and retain a semantic ledger;
- work across existing DAWs through native APIs, plugin bridges, files, and control surfaces.

Helix Agent is the near-term product surface represented by the current browser application. It must remain useful when the connected host is Logic, Cubase, Pro Tools, REAPER, Studio One, Ableton Live, FL Studio, Bitwig, or another supported environment.

## Helix DAW

**Helix DAW** is our own agent-first digital audio workstation, built specifically for artists and Helix Agents.

It is not merely another adapter entry in the Helix Agent host registry. It is a native product with its own:

- audio engine and real-time transport;
- session, track, clip, take, routing, and automation model;
- project format and durable save/recovery behavior;
- plugin/device hosting and parameter model;
- artist-oriented editing, mixing, and monitoring workflows;
- agent-native commands, permissions, verification, and ledger semantics;
- extension and protocol surfaces for controllers and external tools.

The current `helix` host entry is a **design and capability placeholder** for this future product. It does not mean that Helix DAW's audio engine, file format, plugin runtime, or native runtime already exists.

### Current investment decision

Helix DAW implementation is intentionally **parked through Helix Agent v0.4.0**. We will not spend the v0.2.0–v0.4.0 releases building DAW audio, editing, plugin, project, or native UI features. We will lock and maintain the Helix DAW v1.0.0 target feature set, and we may maintain only the shared contracts, simulators, and documentation needed to keep Helix Agent interoperable and platform-agnostic.

## Shared architecture

The products should share contracts, not collapse into one codepath:

```text
packages/helix-domain/   shared intents, capabilities, operations, verification, ledger
apps/helix-agent/        companion/orchestration product for existing hosts and Helix DAW
apps/helix-daw/          native agent-first DAW product
adapters/                host-specific bridges and control-surface integrations
```

The current repository is still in the transition from a single prototype app to this product split. Until the applications are physically separated, keep the distinction visible in names, plans, tests, and documentation.

## Product boundary rule

When a feature is proposed, label it **Agent**, **DAW**, or **Shared** before implementation:

- **Agent:** host discovery, intent UX, autonomy policy, capability negotiation, adapter selection, cross-host safety, approvals, and the semantic ledger.
- **DAW:** audio runtime, native session editing, real-time behavior, project persistence, plugin/device hosting, and artist workflow primitives owned by Helix DAW.
- **Shared:** domain types, intent schema, operation lifecycle, verification classes, constraints, and protocol-neutral test fixtures.

A simulated Helix host, demo session, or browser control surface may validate contracts, but it must never be described as a shipped Helix DAW runtime.

For the complete release commitments, read [`RELEASE-PLAN.md`](RELEASE-PLAN.md).
