import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadEnv } from "vite";

/**
 * Local development utility: serve the freshly built Vercel-presets artifact
 * (.vercel/output) on a fixed port with the project's runtime environment
 * loaded — the same mechanics scripts/verify-preview.mjs uses, but as a
 * long-running server for interactive runtime verification.
 *
 * Usage: node scripts/serve-artifact.mjs [port]
 */

const root = process.cwd();
const port = process.argv[2] || "4203";
const runtimeEnv = loadEnv("production", root, "");

const args = [
  resolve(root, "node_modules/srvx/bin/srvx.mjs"),
  "serve",
  "--prod",
  "--host=127.0.0.1",
  `--port=${port}`,
  "--dir=.",
  "--static=.vercel/output/static",
  "--entry=.vercel/output/functions/__server.func/index.mjs",
];

const child = spawn(process.execPath, args, {
  cwd: root,
  env: {
    ...runtimeEnv,
    ...process.env,
    NODE_ENV: "production",
  },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
