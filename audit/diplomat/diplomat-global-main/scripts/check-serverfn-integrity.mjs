// Verifies every dynamic import in the built artifact's serverFn resolver
// (and sibling chunks) points at an existing file. Exit 1 on any missing file.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = ".vercel/output/functions";
const resolverDir = join(ROOT, "__server.func");
if (!existsSync(resolverDir)) {
  console.log("FATAL: built artifact functions directory not found — run the build first");
  process.exit(1);
}

let refs = 0;
let missing = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.name.endsWith(".mjs")) {
      const text = readFileSync(p, "utf8");
      const re = /import\((["'])(\.[^"']+\.mjs)\1\)/g;
      let m;
      while ((m = re.exec(text))) {
        refs++;
        const resolved = join(dirname(p), m[2]);
        if (!existsSync(resolved)) {
          missing++;
          console.log("MISSING", relative(process.cwd(), p), "->", m[2]);
        }
      }
    }
  }
}
walk(resolverDir);

console.log(`serverFn/chunk dynamic-import refs=${refs} missing=${missing}`);
process.exit(missing > 0 ? 1 : 0);
