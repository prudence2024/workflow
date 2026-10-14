/**
 * Read-only development worker diagnostic.
 *
 * This command verifies environment, restricted DB identity, campaign scope,
 * exact local-form reachability and Chromium launch. It never claims records,
 * changes campaign state, opens a submission page, or submits a form.
 *
 * Usage:
 *   node scripts/form-worker-check.mjs --campaign <uuid>
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { chromium } from "playwright-core";
import { safeBrowserError } from "./form-worker-diagnostics.mjs";
import { runWorkerPreflight, workerDatabaseUrl } from "./worker-preflight.mjs";
import { workerEnvironmentSummary, workerEvent } from "./worker-runtime-diagnostics.mjs";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
};
const campaignId = flag("--campaign");
if (!campaignId) {
  console.error(workerEvent("check_failed", { stage: "arguments", reason: "--campaign is required" }));
  process.exit(2);
}

function resolveChrome() {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return process.env.PLAYWRIGHT_CHROME_PATH;
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  for (const entry of readdirSync(cache)) {
    if (!entry.startsWith("chromium-") || entry.includes("headless-shell")) continue;
    for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]) {
      const candidate = join(cache, entry, sub);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("No Playwright Chromium found");
}

let stage = "startup";
let client = null;
let browser = null;
try {
  stage = "database_connect";
  client = new pg.Client({ connectionString: workerDatabaseUrl(), connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  await client.connect();
  stage = "worker_preflight";
  const preflight = await runWorkerPreflight({ client, campaignId, recordId: null, recover: false });
  const counts = await client.query(
    `select status, count(*)::int as count from public.campaign_records where campaign_id = $1::uuid group by status order by status`,
    [campaignId],
  );
  const eligible = preflight.campaignStatus === "running" && counts.rows.some((row) => ["queued", "retrying"].includes(row.status));

  stage = "local_form_get";
  const response = await fetch("http://localhost:3000/testing-form", { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  if (!response.ok || response.status >= 300) throw new Error(`local form GET returned HTTP ${response.status}`);

  stage = "chromium_launch";
  const executablePath = resolveChrome();
  browser = await chromium.launch({ executablePath, headless: true });
  await browser.close();
  browser = null;

  console.log(workerEvent("check_passed", {
    campaignId,
    environment: workerEnvironmentSummary(),
    identity: preflight.identity,
    campaignStatus: preflight.campaignStatus,
    recordCounts: counts.rows,
    eligible,
    localForm: { method: "GET", path: "/testing-form", status: response.status },
    chromium: { available: true },
  }));
} catch (error) {
  console.error(workerEvent("check_failed", {
    campaignId,
    stage,
    environment: workerEnvironmentSummary(),
    error: safeBrowserError(error),
  }));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (client) await client.end().catch(() => {});
}
