import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const baseUrl = (process.env.TESTING_APP_URL ?? "").replace(/\/$/, "");
const hosted = baseUrl ? describe : describe.skip;

describe("Server Action deployment contract", () => {
  it("builds and deploys one OpenNext artifact without a second build", () => {
    const deployScript = readFileSync(new URL("../scripts/deploy-testing.mjs", import.meta.url), "utf8");
    const buildScript = readFileSync(new URL("../scripts/build-worker.mjs", import.meta.url), "utf8");
    expect(deployScript).toContain('".open-next/worker.js"');
    expect(deployScript).toContain('".open-next/assets"');
    expect(deployScript).not.toContain("opennextjs-cloudflare");
    expect(buildScript).toContain("NEXT_DEPLOYMENT_ID");
    expect(buildScript).toContain("opennextjs-cloudflare");
  });

  it("keeps stale action recovery bounded", () => {
    const recovery = readFileSync(new URL("../src/components/runtime/StaleActionRecovery.tsx", import.meta.url), "utf8");
    expect(recovery).toContain('sessionStorage.setItem(RECOVERY_KEY');
    expect(recovery).toContain("window.location.reload()");
    expect(recovery).toContain("30_000");
    expect(recovery).toContain("x-nextjs-action-not-found");
  });

  it.runIf(existsSync(".open-next/server-functions/default/.next/server/chunks/ssr"))("retains action registrations in the packaged server output", () => {
    const files = walkFiles(".open-next/server-functions/default/.next/server/chunks/ssr");
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).toContain("registerServerReference");
    expect(combined).toMatch(/selectWorkspaceAction|createWorkspaceAction/);

    const manifest = readFileSync(".open-next/server-functions/default/.next/server/server-reference-manifest.json", "utf8");
    expect(manifest).toContain('"filename": "src/app/onboarding/server-actions.ts"');
    expect(manifest).toContain('"exportedName": "selectWorkspaceAction"');
    expect(manifest).toContain('"exportedName": "completeDetailsAction"');
    expect(manifest).toContain('"exportedName": "selectPlanAction"');
    expect(manifest).toContain('"app/onboarding/page"');
  });
});

hosted("deployed Server Action consistency", () => {
  it("serves one current build for dynamic HTML and never exposes the stale action failure", async () => {
    const deploymentId = JSON.parse(readFileSync(".next/routes-manifest.json", "utf8")).deploymentId as string;
    const response = await fetch(`${baseUrl}/login`, { cache: "no-store" });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    expect(html).toContain(`data-dpl-id="${deploymentId}"`);
    expect([...html.matchAll(/\?dpl=([^"&\\]+)/g)].map((match) => match[1]).filter(Boolean)).toEqual(
      expect.arrayContaining([deploymentId]),
    );
    expect(html).not.toMatch(/UnrecognizedActionError|Server Action.+was not found/i);
  });

  it("does not turn protected onboarding HTML into a cached or generic 404 response", async () => {
    const response = await fetch(`${baseUrl}/onboarding?step=workspace`, {
      redirect: "manual",
      cache: "no-store",
    });
    const body = await response.text();
    expect(response.status).not.toBe(404);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    expect(body).not.toMatch(/UnrecognizedActionError|Server Action.+was not found/i);
  });
});

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  }).filter((file) => statSync(file).isFile());
}
