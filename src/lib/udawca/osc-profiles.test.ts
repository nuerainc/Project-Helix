import test from "node:test";
import assert from "node:assert/strict";
import { decodeOscMessage, encodeOscMessage } from "./osc-protocol.ts";
import { createOscProfile, genericDawOscProfile, helixOscProfile } from "./osc-profiles.ts";

test("generic DAW profile maps the portable control surface namespace", () => {
  assert.equal(genericDawOscProfile.namespace, "/daw");
  assert.equal(genericDawOscProfile.trackAddress(2, "volume"), "/daw/track/2/volume");
  assert.equal(genericDawOscProfile.transportAddress("play"), "/daw/transport/play");
  assert.equal(genericDawOscProfile.transportAddress("return"), undefined);
  assert.equal(genericDawOscProfile.bankAddress(), "/daw/bank");
  assert.equal(genericDawOscProfile.playingAddress(), "/daw/transport/playing");
});

test("profiles decode typed feedback without coupling to the Helix namespace", () => {
  const profile = createOscProfile({
    id: "studio-bridge",
    label: "Studio bridge",
    host: "reaper",
    namespace: "/studio",
    zones: 4,
  });
  const feedback = profile.decodeFeedback(
    decodeOscMessage(encodeOscMessage({ address: "/studio/track/3/mute", args: [true] })),
  );
  assert.deepEqual(feedback, { kind: "track", zone: 3, field: "mute", value: true });
  assert.deepEqual(
    profile.decodeFeedback(
      decodeOscMessage(encodeOscMessage({ address: "/studio/transport/playing", args: [false] })),
    ),
    { kind: "playing", value: false },
  );
  assert.equal(profile.decodeFeedback({ address: "/helix/track/0/mute", args: [true] }), undefined);
});

test("profiles reject invalid namespaces and zones", () => {
  assert.throws(() => createOscProfile({ id: "bad", label: "Bad", host: "generic", namespace: "/" }));
  assert.throws(() => genericDawOscProfile.trackAddress(8, "mute"), /0 through 7/);
  assert.throws(() => helixOscProfile.trackAddress(-1, "mute"), /0 through 7/);
});
