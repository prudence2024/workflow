import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const deploymentId = process.env.NEXT_DEPLOYMENT_ID || `workflow-${Date.now()}`;
const result = spawnSync(command, ["opennextjs-cloudflare", "build"], {
  env: { ...process.env, NEXT_DEPLOYMENT_ID: deploymentId },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
