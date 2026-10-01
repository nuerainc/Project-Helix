# Helix Agent Artist Workflows

This document turns the v0.3.0 and v0.4.0 artist-workflow promises into reusable, capability-aware recipes. These are **Helix Agent** workflows; they do not implement Helix DAW audio, editing, or project-runtime features.

## Recipe contract

Every recipe compiles into the same inspect → propose → approve/skip → execute → verify → ledger lifecycle.

- **Inputs:** session snapshot, active host, capability/precision matrix, project policy, and the artist's target.
- **Plan:** ordered operations with dependencies, bounded changes, mechanism selection, precision, preconditions, and rollback metadata.
- **Degradation:** exact host execution, high-confidence bridge execution, coarse control, human-assisted step, or explicit refusal.
- **Evidence:** findings and measurements remain attached to each operation; the Agent never substitutes a musical opinion for an exposed measurement.
- **Completion:** the recipe reports completed, partially completed, human-required, refused, or blocked-by-stale-state outcomes.

## v0.3.0 adapter-ecosystem recipes

These recipes establish a portable vocabulary that can run against the loopback host, a simulator, or a supported adapter.

### 1. Session intake and orientation

**Prompt examples:** “Open the session and tell me what needs attention” or “Give me the next action plan.”

1. Snapshot session identity, tempo, sample rate, duration, playhead, active host, and adapter health.
2. Map tracks, buses, markers, media availability, processing, takes, sends, and returns.
3. Search findings for clipping, true-peak/headroom, missing media, unused material, naming inconsistencies, and routing anomalies.
4. Produce a concise checklist grouped into safe fixes, review items, and human-only steps.
5. Preserve current selection/playhead when the host exposes them.

**Exit evidence:** a portable session summary, finding IDs, capability snapshot, and an approved checklist; no claim that a render or media repair occurred.

### 2. Navigation and audition

**Prompt examples:** “Jump to chorus three,” “Loop the bridge,” or “Find the vocal clipping.”

1. Resolve a marker, section, track, or finding using locale-safe aliases.
2. Preview the target by moving the playhead or setting a loop/audition range when supported.
3. Keep transport changes separate from destructive operations and record them in the ledger when they affect the plan.
4. Fall back to a human instruction when the host exposes no reliable navigation surface.

**Exit evidence:** resolved target, requested range, actual transport state, and precision/fallback explanation.

### 3. Bounded mix pass

**Prompt examples:** “Prepare a rough mix,” “Gain-stage the guitars,” or “Make a vocal clarity pass.”

1. Inspect the target group and its bus/routing context.
2. Propose bounded gain, pan, mute, solo, monitor, and send/return changes within project policy.
3. Group related changes into dependency-ordered batches; never hide an individual refusal inside a successful batch.
4. Verify resulting track state plus headroom and true-peak findings.

**Exit evidence:** grouped diff, per-operation mechanism and precision, safety findings before/after, and rollback availability.

### 4. Vocal and take review

**Prompt examples:** “Review the lead takes,” “Prepare a comp plan,” or “Trim vocal silence where possible.”

1. Rank takes using exposed SNR, clipping, pitch, timing, and noise-floor evidence.
2. Recommend candidates without claiming musical or artistic judgment.
3. Keep/label/archive only through non-destructive, capability-supported operations.
4. Put unsupported clip edits, fades, or comp decisions into an explicit human review queue.

**Exit evidence:** measurement table, candidate set, non-destructive changes, and unresolved human actions.

### 5. Arrangement and cleanup

**Prompt examples:** “Find suspicious tracks,” “Organize the chorus buses,” or “Clean up names without deleting anything.”

1. Detect unused/silent tracks, duplicate or ambiguous names, missing media, and inconsistent routing.
2. Propose labels, colors/tags, folders/buses, and safe organization changes where supported.
3. Never delete source material in the default recipe; deletion requires a separate policy and approval path.
4. Verify organization without normalizing unknown or partial state.

**Exit evidence:** proposed cleanup diff, preserved-source-material statement, and explicit unsupported/refused items.

## v0.4.0 production-beta recipes

v0.4.0 composes the v0.3.0 recipes into recoverable production jobs.

### 6. Production templates

Ship named templates for **session intake, rough-mix preparation, vocal cleanup, take review, gain-staging/true-peak check, automation pass, revision comparison, and delivery readiness**. Each template must compile into the same capability-aware plan format rather than assume a DAW-specific UI.

Templates need:

- dependency ordering and transaction boundaries;
- cancellation and partial-result reporting;
- offline queue/reconciliation with conflict review before commit;
- named checkpoint before a multi-operation job;
- recovery after disconnect, stale state, restart, or interrupted adapter update.

### 7. Revision and recall

1. Save named session checkpoints with adapter and capability snapshots.
2. Compare two snapshots using semantic diffs for tracks, routing, takes, automation, markers, and policy-relevant findings.
3. Restore only an approved state and only where the adapter advertises support.
4. Retain the original operation and verification history after reconnect or partial application.

### 8. Delivery readiness

Run configurable checks for clipping, true peak, headroom, missing/disabled processing, unresolved findings, routing, naming, sample rate, and export prerequisites. Produce a human-readable report with statuses **ready**, **review**, **blocked**, or **not exposed**. The report must explicitly state when no audio render occurred.

### 9. Handoff and diagnostics

Package a redacted continuation bundle containing:

- session and capability snapshot;
- adapter health/version/permissions state;
- findings and approved plan;
- grouped diffs and verification evidence;
- failed, partial, refused, and human-required operations;
- next actions for another artist, engineer, or Helix Agent.

Exclude secrets, credentials, private bridge tokens, and audio/media by default.

## Acceptance checklist

- A single recipe produces comparable ledger semantics across two integration mechanisms.
- Each operation advertises its mechanism, precision, verification class, and fallback.
- Disconnected or stale adapters cannot report a successful commit.
- Partial execution identifies completed, pending, refused, and human-required work separately.
- Unknown, partial, and conflicted session values remain explicit.
- Every mutating recipe shows a diff, policy decision, and rollback/recovery posture before execution.
- v0.4.0 templates remain useful without Helix DAW or a proprietary host project format.
