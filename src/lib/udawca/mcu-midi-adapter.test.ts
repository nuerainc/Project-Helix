import test from "node:test";
import assert from "node:assert/strict";
import { createMcuAdapter, type McuAdapter } from "./mcu-midi-adapter.server.ts";
import type { HuiMidiPort } from "./hui-midi-adapter.server.ts";
import type { Operation } from "../helix/types.ts";

class FakeMidiPort implements HuiMidiPort {
  readonly sent: number[][] = [];
  private onMessage?: (message: number[]) => void;

  listInputs() {
    return ["MCU In"];
  }

  listOutputs() {
    return ["MCU Out"];
  }

  open(_inputName: string, _outputName: string, onMessage: (message: number[]) => void) {
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

test("MCU adapter opens the configured native MIDI ports", async () => {
  const port = new FakeMidiPort();
  const adapter = createMcuAdapter({ inputPort: "MCU In", outputPort: "MCU Out" }, port);
  await adapter.connect();
  assert.equal(adapter.health().state, "connected");
  await adapter.disconnect();
});

test("MCU adapter dispatches mute and volume through note and pitch-bend messages", async () => {
  const port = new FakeMidiPort();
  const adapter = createMcuAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();

  const result = await adapter.execute(operationWithChanges());
  assert.equal(result.status, "committed");
  assert.equal(result.completedChanges, 2);
  assert.deepEqual(port.sent.slice(0, 2), [
    [0x90, 16, 0x7f],
    [0x90, 16, 0],
  ]);
  assert.equal(port.sent.length, 5);
  await adapter.disconnect();
});

test("MCU feedback updates the visible bank and bank() sends the correct note", async () => {
  const port = new FakeMidiPort();
  const adapter: McuAdapter = createMcuAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();
  port.receive([0x90, 16, 0x7f]);
  assert.equal((await adapter.snapshot()).tracks[0]?.mute, true);

  adapter.bank(1);
  assert.deepEqual(port.sent.slice(-2), [
    [0x90, 47, 0x7f],
    [0x90, 47, 0],
  ]);
  await adapter.disconnect();
});

test("MCU adapter refuses unsupported operations without claiming a commit", async () => {
  const port = new FakeMidiPort();
  const adapter = createMcuAdapter({ inputPort: "in", outputPort: "out" }, port);
  await adapter.connect();
  const operation = operationWithChanges();
  operation.changes = [{ kind: "rename", trackId: "tr_kick", name: "Kick" }];
  const result = await adapter.execute(operation);
  assert.equal(result.status, "refused");
  assert.equal(port.sent.length, 0);
  await adapter.disconnect();
});

function operationWithChanges(): Operation {
  return {
    id: "op_mcu_test",
    intent: "Mute and raise Kick",
    summary: "Mute and raise Kick",
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
