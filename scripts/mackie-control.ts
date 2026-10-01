#!/usr/bin/env node
import { createNodeHuiMidiPort } from "../src/lib/udawca/hui-midi-adapter.server.ts";
import { createNodeMcuAdapter } from "../src/lib/udawca/mcu-midi-adapter.server.ts";

const port = await createNodeHuiMidiPort();
const args = new Set(process.argv.slice(2));

if (args.has("--list") || args.size === 0) {
  console.log("MCU MIDI inputs:");
  for (const name of port.listInputs()) console.log(`  ${name}`);
  console.log("MCU MIDI outputs:");
  for (const name of port.listOutputs()) console.log(`  ${name}`);
  if (args.size === 0) {
    console.log("\nTo connect: MCU_INPUT_PORT='...' MCU_OUTPUT_PORT='...' npm run mcu:connect");
  }
  process.exit(0);
}

if (args.has("--connect")) {
  const inputPort = process.env.MCU_INPUT_PORT;
  const outputPort = process.env.MCU_OUTPUT_PORT;
  if (!inputPort || !outputPort) {
    console.error("Set MCU_INPUT_PORT and MCU_OUTPUT_PORT to exact names from `npm run mcu:list`.");
    process.exit(2);
  }
  const adapter = await createNodeMcuAdapter({ inputPort, outputPort });
  const health = await adapter.connect();
  console.log(JSON.stringify({ adapter: adapter.descriptor, health }, null, 2));
  console.log("MCU connection is active. Press Ctrl+C to disconnect.");
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
  "Usage: npm run mcu:list | MCU_INPUT_PORT='...' MCU_OUTPUT_PORT='...' npm run mcu:connect",
);
process.exit(2);
