import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("form supervisor safety", () => {
  it("does not implicitly recover stale analysis jobs on every poll", () => {
    const source = readFileSync("scripts/form-automation-worker.mjs", "utf8");
    const invocation = source.slice(source.indexOf("const analysis = await runChild"));
    expect(invocation).toContain('"--campaign", campaignId');
    expect(invocation).toContain('"--limit", String(batchSize)');
    expect(invocation).not.toContain('"--recover"');
  });

  it("runs the shared read-only worker preflight before opening the supervisor", () => {
    const source = readFileSync("scripts/form-automation-worker.mjs", "utf8");
    expect(source).toContain('import { runWorkerPreflight } from "./worker-preflight.mjs";');
    const serverStart = source.indexOf("createServer(");
    const preflight = source.indexOf("runWorkerPreflight");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(serverStart);
    expect(source).toContain("campaignId,");
    expect(source).toContain("recover: false");
  });
});
