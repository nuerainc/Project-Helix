import test from "node:test";
import assert from "node:assert/strict";
import { createProToolsHuiAdapter, type HuiMidiPort } from "./hui-midi-adapter.server.ts";
import type { Operation } from "../helix/types.ts";

class FakeMidiPort implements HuiMidiPort {
  readonly sent: number[][] = [];
  openArgs: [string, string] | undefined;
  private onMessage?: (message: number[]) => void;

  listInputs() {
    return ["Pro Tools HUI In"];
  }

  listOutputs() {
    return ["Pro Tools HUI Out"];
  }

  open(inputName: string, outputName: string, onMessage: (message: number[]) => void) {
    this.openArgs = [inputName, outputName];
    this.onMessage = onMessage;
  }

  send(message: readonly number[]) {
    this.sent.push([...message]);
  }

  close() {
    this.onMessage = undefined;
  }

  receive(message: number[]) {
    this.onMessage?.(message);
  }
}

test("native adapter opens configured ports and sends HUI keepalive", async () => {
  const port = new FakeMidiPort();
  const adapter = createProToolsHuiAdapter(
    { inputPort: "Pro Tools HUI In", outputPort: "Pro Tools HUI Out", pingIntervalMs: 10_000 },
    port,
  );

  await adapter.connect();
  assert.deepEqual(port.openArgs, ["Pro Tools HUI In", "Pro Tools HUI Out"]);
  assert.equal(adapter.health().state, "connected");
  await adapter.disconnect();
});

test("native adapter dispatches mute and volume through real HUI message sequences", async () => {
  const port = new FakeMidiPort();
  const adapter = createProToolsHuiAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();

  const result = await adapter.execute(operationWithChanges());
  assert.equal(result.status, "committed");
  assert.equal(result.completedChanges, 2);
  assert.deepEqual(port.sent.slice(0, 4), [
    [0xb0, 0x0c, 0],
    [0xb0, 0x2c, 0x42],
    [0xb0, 0x0c, 0],
    [0xb0, 0x2c, 0x02],
  ]);
  assert.equal(port.sent.length, 10);
  await adapter.disconnect();
});

test("native adapter refuses unsupported changes instead of claiming execution", async () => {
  const port = new FakeMidiPort();
  const adapter = createProToolsHuiAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();
  const operation = operationWithChanges();
  operation.changes = [{ kind: "rename", trackId: "tr_lead", name: "Vocal" }];

  const result = await adapter.execute(operation);
  assert.equal(result.status, "refused");
  assert.equal(port.sent.length, 0);
  await adapter.disconnect();
});

test("native adapter consumes HUI feedback into the current bank snapshot", async () => {
  const port = new FakeMidiPort();
  const adapter = createProToolsHuiAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();
  port.receive([0xb0, 0x0c, 0]);
  port.receive([0xb0, 0x2c, 0x42]);

  const snapshot = await adapter.snapshot();
  assert.equal(snapshot.tracks[0]?.mute, true);
  await adapter.disconnect();
});

test("native adapter automates an existing send slot and consumes meter/send feedback", async () => {
  const port = new FakeMidiPort();
  const adapter = createProToolsHuiAdapter(
    { inputPort: "in", outputPort: "out", sendStepDb: 0.5, bankOffset: 8 },
    port,
  );
  await adapter.connect();

  const operation = operationWithChanges();
  operation.changes = [{ kind: "send", trackId: "tr_gtrl", dest: "tr_gtrbus", db: -3 }];
  const result = await adapter.execute(operation);
  assert.equal(result.status, "committed");
  assert.deepEqual(port.sent.slice(0, 5), [
    [0xb0, 0x0c, 11],
    [0xb0, 0x2c, 0x47],
    [0xb0, 0x0c, 11],
    [0xb0, 0x2c, 0x07],
    [0xb0, 0x41, 0x3a],
  ]);

  port.receive([0xa0, 1, 0x0b]);
  port.receive([0xa0, 1, 0x1e]);
  port.receive([0xb0, 0x11, 0x50]);
  const snapshot = await adapter.snapshot();
  const track = snapshot.tracks.find((candidate) => candidate.id === "tr_gtrl");
  assert.equal(track?.meterLeftDb, -16);
  assert.equal(track?.meterRightDb, -4);
  assert.equal(track?.sends[0]?.db, -60 + (0x50 / 127) * 72);
  const verification = await adapter.verify(operation);
  assert.match(verification.observed, /Gtr L/);
  await adapter.disconnect();
});

function operationWithChanges(): Operation {
  return {
    id: "op_hui_test",
    intent: "Mute and raise Lead Vocal",
    summary: "Mute and raise Lead Vocal",
    trackId: "tr_kick",
    mechanism: "control_surface",
    cap: 2,
    precision: "COARSE",
    verifyClass: "V1",
    changes: [
      { kind: "mute", trackId: "tr_kick", enabled: true },
      { kind: "volume", trackId: "tr_kick", deltaDb: 1 },
    ],
    preconditions: [],
    toleranceDb: 1,
    reversibility: true,
    approval: "user",
    autoSafe: false,
    phase: "propose",
  };
}
