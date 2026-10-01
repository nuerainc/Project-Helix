import test from "node:test";
import assert from "node:assert/strict";
import { createOscAdapter, type OscTransport } from "./osc-adapter.server.ts";
import { decodeOscMessage, encodeOscMessage, oscTrackAddress } from "./osc-protocol.ts";
import { listAdapterRegistry } from "./adapter-registry.server.ts";
import { genericDawOscProfile, helixOscProfile } from "./osc-profiles.ts";
import type { Operation } from "../helix/types.ts";

class FakeOscTransport implements OscTransport {
  readonly sent: Uint8Array[] = [];
  private onPacket?: (packet: Uint8Array) => void;

  async open(onPacket: (packet: Uint8Array) => void) {
    this.onPacket = onPacket;
  }

  send(packet: Uint8Array) {
    this.sent.push(packet);
  }

  async close() {
    this.onPacket = undefined;
  }

  receive(packet: Uint8Array) {
    this.onPacket?.(packet);
  }
}

test("OSC codec round-trips typed Helix arguments", () => {
  const encoded = encodeOscMessage({
    address: "/helix/track/0/mute",
    args: [true, 1, -2.5, "Kick"],
  });
  assert.deepEqual(decodeOscMessage(encoded), {
    address: "/helix/track/0/mute",
    args: [true, 1, -2.5, "Kick"],
  });
});

test("OSC adapter sends typed mute and volume messages", async () => {
  const transport = new FakeOscTransport();
  const adapter = createOscAdapter(
    { localPort: 9000, remoteHost: "127.0.0.1", remotePort: 9001 },
    transport,
  );
  await adapter.connect();
  const result = await adapter.execute(operationWithChanges());
  assert.equal(result.status, "committed");
  assert.equal(transport.sent.length, 2);
  assert.deepEqual(decodeOscMessage(transport.sent[0]!), {
    address: oscTrackAddress(0, "mute"),
    args: [true],
  });
  assert.deepEqual(decodeOscMessage(transport.sent[1]!), {
    address: oscTrackAddress(0, "volume"),
    args: [-1],
  });
  await adapter.disconnect();
});

test("OSC feedback updates session state and unsupported operations are refused", async () => {
  const transport = new FakeOscTransport();
  const adapter = createOscAdapter(
    { localPort: 9000, remoteHost: "127.0.0.1", remotePort: 9001 },
    transport,
  );
  await adapter.connect();
  transport.receive(encodeOscMessage({ address: oscTrackAddress(0, "mute"), args: [true] }));
  assert.equal((await adapter.snapshot()).tracks[0]?.mute, true);
  const operation = operationWithChanges();
  operation.changes = [{ kind: "rename", trackId: "tr_kick", name: "Kick" }];
  assert.equal((await adapter.execute(operation)).status, "refused");
  await adapter.disconnect();
});

test("generic DAW profile routes control messages and discovers generic capabilities", async () => {
  const transport = new FakeOscTransport();
  const adapter = createOscAdapter(
    { localPort: 9000, remoteHost: "127.0.0.1", remotePort: 9001, profile: genericDawOscProfile },
    transport,
  );
  assert.equal(adapter.descriptor.host, "generic");
  assert.equal((await adapter.discover()).host, "generic");
  await adapter.connect();
  await adapter.execute(operationWithChanges());
  assert.deepEqual(decodeOscMessage(transport.sent[0]!), {
    address: "/daw/track/0/mute",
    args: [true],
  });
  transport.receive(encodeOscMessage({ address: "/daw/track/0/mute", args: [false] }));
  assert.equal((await adapter.snapshot()).tracks[0]?.mute, false);
  await adapter.disconnect();
});

test("the default adapter remains backward-compatible with Helix OSC", () => {
  assert.equal(helixOscProfile.trackAddress(0, "mute"), oscTrackAddress(0, "mute"));
});

test("registry exposes implemented HUI and MCU plus experimental OSC", () => {
  assert.deepEqual(
    listAdapterRegistry().map((entry) => [entry.id, entry.status]),
    [
      ["HUI", "implemented"],
      ["MCU", "implemented"],
      ["OSC", "experimental"],
    ],
  );
});

function operationWithChanges(): Operation {
  return {
    id: "op_osc_test",
    intent: "Mute and lower Kick",
    summary: "Mute and lower Kick",
    trackId: "tr_kick",
    mechanism: "control_surface",
    cap: 2,
    precision: "COARSE",
    verifyClass: "V1",
    changes: [
      { kind: "mute", trackId: "tr_kick", enabled: true },
      { kind: "volume", trackId: "tr_kick", absDb: -1 },
    ],
    preconditions: [],
    toleranceDb: 1,
    reversibility: true,
    approval: "user",
    autoSafe: false,
    phase: "propose",
  };
}
