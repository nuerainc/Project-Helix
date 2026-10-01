#!/usr/bin/env node
import { createProjectStateStore } from "../src/lib/helix/native-project-state.server.ts";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--help")) {
  console.log(
    "Native project state: npm run project:state -- --root <dir> --project <id> [--list|--load|--restore <backup>]",
  );
  process.exit(0);
}

const rootDir = value("--root") ?? process.env.HELIX_PROJECT_STATE_DIR ?? ".helix-state";
const projectId = value("--project") ?? process.env.HELIX_PROJECT_ID ?? "default";
const store = createProjectStateStore({ rootDir, projectId });

if (process.argv.includes("--list")) {
  console.log((await store.listBackups()).join("\n"));
} else if (process.argv.includes("--restore")) {
  const backup = value("--restore");
  const restored = await store.restoreBackup(backup === "latest" ? undefined : backup);
  console.log(`Restored ${restored.projectId} at ${new Date(restored.savedAt).toISOString()}`);
} else {
  const loaded = await store.load();
  if (!loaded) console.log("No durable project state exists.");
  else
    console.log(
      `${loaded.projectId} · saved ${new Date(loaded.savedAt).toISOString()} · checksum ${loaded.checksum}`,
    );
}
