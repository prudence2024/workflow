import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".open-next/worker.js") || !existsSync(".open-next/assets")) {
  throw new Error("Missing .open-next output. Run npm run build:worker once before deploying.");
}

// OpenNext's deploy wrapper asks Wrangler for a local platform proxy, which
// incorrectly requires a local Hyperdrive emulation URL even for a remote
// testing binding. Deploy the already-built Worker directly through Wrangler.
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["wrangler", "deploy", "--env", "testing", "--keep-vars"], {
  env: { ...process.env, OPEN_NEXT_DEPLOY: "true" },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
