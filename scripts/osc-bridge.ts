#!/usr/bin/env node
import { createNodeOscAdapter } from "../src/lib/udawca/osc-adapter.server.ts";

const localPort = Number(process.env.OSC_LOCAL_PORT ?? 9000);
const remoteHost = process.env.OSC_REMOTE_HOST ?? "127.0.0.1";
const remotePort = Number(process.env.OSC_REMOTE_PORT ?? 9001);

if (process.argv.includes("--help")) {
  console.log(
    "OSC profile: /helix/track/{zone}/{mute|solo|arm|volume}, /helix/transport/{play|stop|record}, /helix/bank",
  );
  console.log("Configure OSC_LOCAL_PORT, OSC_REMOTE_HOST, and OSC_REMOTE_PORT before connecting.");
  process.exit(0);
}

const adapter = await createNodeOscAdapter({ localPort, remoteHost, remotePort });
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
