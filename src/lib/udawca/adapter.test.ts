import test from "node:test";
import assert from "node:assert/strict";
import { createDisconnectedAdapterHealth, createProToolsHuiSimulator } from "./adapter.ts";
import type { Operation } from "../helix/types.ts";

test("a disconnected adapter reports no permission or last-seen claim", () => {
  assert.deepEqual(createDisconnectedAdapterHealth("Pro Tools HUI adapter is not connected."), {
    state: "disconnected",
    permission: "unknown",
    staleAfterMs: 2_000,
    message: "Pro Tools HUI adapter is not connected.",
  });
});

test("the simulator lifecycle stays explicit and truthful", async () => {
  const adapter = createProToolsHuiSimulator();
  assert.equal(adapter.health().state, "disconnected");
  assert.match(adapter.health().message ?? "", /Live HUI transport is not implemented/);

  const connected = await adapter.connect();
  assert.equal(connected.state, "connected");
  assert.equal(connected.permission, "granted");

  await adapter.disconnect();
  assert.equal(adapter.health().state, "disconnected");
});

test("a disconnected simulator refuses execution instead of claiming a commit", async () => {
  const adapter = createProToolsHuiSimulator();
  const operation = operationWithChanges(1);
  const result = await adapter.execute(operation);

  assert.equal(result.status, "refused");
  assert.equal(result.completedChanges, 0);
  assert.match(result.message, /no commit claimed/);
});

test("the connected simulator applies one HUI change and reports a multi-change partial result", async () => {
  const adapter = createProToolsHuiSimulator();
  await adapter.connect();
  const operation = operationWithChanges(2);

  const result = await adapter.execute(operation);
  assert.equal(result.status, "partial");
  assert.equal(result.completedChanges, 1);
  assert.equal(result.totalChanges, 2);

  const snapshot = await adapter.snapshot();
  assert.equal(snapshot.tracks.find((track) => track.id === "tr_lead")?.mute, true);

  const verification = await adapter.verify(operation);
  assert.equal(verification.status, "pass");
});

test("adapter health distinguishes stale state from disconnected state", () => {
  const health = createDisconnectedAdapterHealth("No live DAW in the simulator.");
  const stale = { ...health, state: "stale" as const, lastSeenAt: 100, latencyMs: 42 };

  assert.equal(stale.state, "stale");
  assert.equal(stale.lastSeenAt, 100);
  assert.equal(stale.latencyMs, 42);
  assert.notEqual(stale.state, health.state);
});

function operationWithChanges(count: number): Operation {
  return {
    id: `op_test_${count}`,
    intent: "Mute Lead Vocal",
    summary: "Mute Lead Vocal",
    trackId: "tr_lead",
    mechanism: "control_surface",
    cap: 2,
    precision: "EXACT",
    verifyClass: "V1",
    changes: Array.from({ length: count }, () => ({
      kind: "mute" as const,
      trackId: "tr_lead",
      enabled: true,
    })),
    preconditions: [],
    toleranceDb: 0,
    reversibility: true,
    approval: "user",
    autoSafe: true,
    phase: "propose",
  };
}
