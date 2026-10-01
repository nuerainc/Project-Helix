#!/usr/bin/env node
import { createNodeOscAdapter } from "../src/lib/udawca/osc-adapter.server.ts";
import { genericDawOscProfile, helixOscProfile } from "../src/lib/udawca/osc-profiles.ts";

const localPort = Number(process.env.OSC_LOCAL_PORT ?? 9000);
const remoteHost = process.env.OSC_REMOTE_HOST ?? "127.0.0.1";
const remotePort = Number(process.env.OSC_REMOTE_PORT ?? 9001);
const profileName = process.env.OSC_PROFILE ?? "helix";
const profile =
  profileName === "generic"
    ? genericDawOscProfile
    : profileName === "helix"
      ? helixOscProfile
      : undefined;
if (!profile) throw new Error(`Unknown OSC_PROFILE: ${profileName}. Use helix or generic.`);

if (process.argv.includes("--help")) {
  console.log(
    "OSC_PROFILE=helix|generic; helix uses /helix/* and generic uses /daw/*",
  );
  console.log("Configure OSC_PROFILE, OSC_LOCAL_PORT, OSC_REMOTE_HOST, and OSC_REMOTE_PORT before connecting.");
  process.exit(0);
}

const adapter = await createNodeOscAdapter({ localPort, remoteHost, remotePort, profile });
const health = await adapter.connect();
console.log(JSON.stringify({ adapter: adapter.descriptor, health }, null, 2));
console.log("OSC UDP bridge is active. Press Ctrl+C to disconnect.");
const shutdown = async () => {
  await adapter.disconnect();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.stdin.resume();
await new Promise<void>(() => {});
