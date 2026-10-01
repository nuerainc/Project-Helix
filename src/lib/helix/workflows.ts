export type WorkflowRelease = "v0.3.0" | "v0.4.0";

export interface WorkflowStarter {
  id: string;
  title: string;
  description: string;
  prompt: string;
  release: WorkflowRelease;
  available: boolean;
}

/**
 * Artist-facing entry points intentionally stay separate from host-specific
 * compiler rules. Available starters submit prompts already supported by the
 * current Agent; planned starters make the roadmap visible without implying
 * that a beta workflow exists.
 */
export const WORKFLOW_STARTERS: WorkflowStarter[] = [
  {
    id: "session-intake",
    title: "Session intake",
    description: "Scan the session and surface measurable risks.",
    prompt: "Inspect session",
    release: "v0.3.0",
    available: true,
  },
  {
    id: "routing-review",
    title: "Routing review",
    description: "Map sends, buses, and returns before a mix pass.",
    prompt: "Inspect routing",
    release: "v0.3.0",
    available: true,
  },
  {
    id: "take-review",
    title: "Take review",
    description: "Rank lead vocal takes using exposed measurements.",
    prompt: "Inspect the lead vocal takes",
    release: "v0.3.0",
    available: true,
  },
  {
    id: "safe-cleanup",
    title: "Safe cleanup",
    description: "Propose bounded fixes without deleting source material.",
    prompt: "Fix safe findings",
    release: "v0.3.0",
    available: true,
  },
  {
    id: "rough-mix",
    title: "Rough-mix preparation",
    description: "Group a bounded gain, headroom, and automation pass.",
    prompt: "Inspect session",
    release: "v0.4.0",
    available: false,
  },
  {
    id: "delivery-readiness",
    title: "Delivery readiness",
    description: "Run configurable checks and explain what still needs review.",
    prompt: "Inspect session",
    release: "v0.4.0",
    available: false,
  },
  {
    id: "revision-recall",
    title: "Revision and recall",
    description: "Compare named snapshots and restore an approved state.",
    prompt: "Inspect session",
    release: "v0.4.0",
    available: false,
  },
  {
    id: "handoff",
    title: "Artist handoff",
    description: "Package a redacted plan, findings, diffs, and next actions.",
    prompt: "Inspect session",
    release: "v0.4.0",
    available: false,
  },
];
