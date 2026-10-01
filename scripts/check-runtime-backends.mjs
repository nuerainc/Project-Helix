import os from "node:os";

const platform = process.platform;
const expected = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform === "linux" ? "linux" : "unsupported";

console.log(`Runtime backend check: ${platform} (${os.arch()}) -> ${expected}`);
if (expected === "unsupported") {
  throw new Error(`Unsupported CI platform: ${platform}`);
}

await import("node:dgram");
console.log("✓ Node UDP backend is available");

try {
  const module = await import("midi");
  const midi = module.default ?? module;
  const input = new midi.Input();
  const output = new midi.Output();
  const inputs = input.getPortCount();
  const outputs = output.getPortCount();
  input.closePort();
  output.closePort();
  console.log(`✓ Native MIDI backend is available (${inputs} input(s), ${outputs} output(s))`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Native MIDI backend failed to load on ${expected}: ${message}`);
  process.exitCode = 1;
}
