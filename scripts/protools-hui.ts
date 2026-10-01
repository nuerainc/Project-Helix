#!/usr/bin/env node
import {
  createNodeHuiMidiPort,
  createNodeProToolsHuiAdapter,
} from "../src/lib/udawca/hui-midi-adapter.server.ts";

const port = await createNodeHuiMidiPort();
const args = new Set(process.argv.slice(2));

if (args.has("--list") || args.size === 0) {
  console.log("HUI MIDI inputs:");
  for (const name of port.listInputs()) console.log(`  ${name}`);
  console.log("HUI MIDI outputs:");
  for (const name of port.listOutputs()) console.log(`  ${name}`);
  if (args.size === 0) {
    console.log("\nTo connect: HUI_INPUT_PORT='...' HUI_OUTPUT_PORT='...' npm run hui:connect");
  }
  process.exit(0);
}

if (args.has("--connect")) {
  const inputPort = process.env.HUI_INPUT_PORT;
  const outputPort = process.env.HUI_OUTPUT_PORT;
  if (!inputPort || !outputPort) {
    console.error("Set HUI_INPUT_PORT and HUI_OUTPUT_PORT to exact names from `npm run hui:list`.");
    process.exit(2);
  }
  const adapter = await createNodeProToolsHuiAdapter({ inputPort, outputPort });
  const health = await adapter.connect();
  console.log(JSON.stringify({ adapter: adapter.descriptor, health }, null, 2));
  console.log("HUI keepalive is active. Press Ctrl+C to disconnect.");
  const shutdown = async () => {
    await adapter.disconnect();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.stdin.resume();
  await new Promise<void>(() => {});
}

console.error(
  "Usage: npm run hui:list | HUI_INPUT_PORT='...' HUI_OUTPUT_PORT='...' npm run hui:connect",
);
process.exit(2);
