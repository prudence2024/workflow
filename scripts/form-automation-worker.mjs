/**
 * Always-on testing supervisor for the browser-capable form workers.
 *
 * Run this process in a dedicated Node + Playwright service. Cloudflare
 * Workers intentionally do not run Chromium. Each child invocation claims a
 * bounded batch using the existing FOR UPDATE SKIP LOCKED logic, then exits;
 * the supervisor provides automatic polling and restart boundaries.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";
import { runWorkerPreflight } from "./worker-preflight.mjs";

config({ path: ".env.local" });
config({ path: ".env" });

if ((process.env.NEON_BRANCH ?? "").toLowerCase() !== "development") {
  throw new Error("FORM_WORKER_REQUIRES_DEVELOPMENT_BRANCH");
}

const intervalMs = Math.max(5_000, Number(process.env.FORM_WORKER_POLL_MS ?? 15_000));
const batchSize = Math.max(1, Math.min(25, Number(process.env.FORM_WORKER_BATCH_SIZE ?? 5)));
const port = Number(process.env.PORT ?? process.env.FORM_WORKER_HEALTH_PORT ?? 8787);
const databaseUrl = process.env.WORKER_DATABASE_URL;
if (!databaseUrl) throw new Error("FORM_WORKER_REQUIRES_RESTRICTED_DATABASE_URL");
const campaignId = process.env.WORKFLOW_WORKER_CAMPAIGN_ID?.trim();
if (!campaignId) throw new Error("FORM_WORKER_REQUIRES_CAMPAIGN_SCOPE");
const state = { startedAt: new Date(), lastHeartbeatAt: null, lastCycleAt: null, lastError: null, cycles: 0 };

// Fail before polling if the supplied login can bypass tenant restrictions or
// owns application tables. Child SET LOCAL ROLE is an additional boundary.
const guard = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
try {
  await guard.connect();
  const result = await guard.query(`
    select r.rolsuper, r.rolbypassrls,
      exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('organizations', 'campaign_records', 'contacts')
          and pg_has_role(current_user, c.relowner, 'MEMBER')
      ) as owns_app_tables,
      pg_has_role(current_user, 'workflow_worker', 'MEMBER') as worker_role
    from pg_roles r where r.rolname = current_user
  `);
  const role = result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_app_tables || !role.worker_role) {
    throw new Error('FORM_WORKER_RESTRICTED_ROLE_REQUIRED');
  }
  // Run the same read-only environment, branch, identity, scope and exact
  // local-form checks as the child workers before opening the supervisor or
  // starting a polling cycle. No campaign rows are claimed or changed here.
  const preflight = await runWorkerPreflight({
    client: guard,
    campaignId,
    recordId: null,
    recover: false,
  });
  console.log(`form automation preflight passed; mode=${preflight.mode} campaign=${campaignId}`);
} finally {
  await guard.end();
}

function runChild(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
    } });
    child.once("error", (error) => resolve({ ok: false, code: null, error: error.name }));
    child.once("exit", (code) => resolve({ ok: code === 0, code, error: null }));
  });
}

async function counts() {
  if (!databaseUrl) return { pending: null, processing: null, failed: null, oldestPendingAt: null };
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      select
        count(*) filter (where status in ('queued','retrying'))::int as pending,
        count(*) filter (where status = 'processing')::int as processing,
        count(*) filter (where status in ('failed','needs_attention','human_action_required'))::int as failed,
        min(created_at) filter (where status in ('queued','retrying')) as oldest_pending_at
        from public.campaign_records
    `);
    const row = result.rows[0] ?? {};
    return { pending: row.pending ?? 0, processing: row.processing ?? 0, failed: row.failed ?? 0, oldestPendingAt: row.oldest_pending_at ?? null };
  } finally {
    await client.end();
  }
}

async function cycle() {
  state.lastHeartbeatAt = new Date();
  // Stale-row recovery is an explicit operator action. The development
  // preflight deliberately rejects implicit recovery, so the supervisor must
  // not pass --recover on every poll cycle.
  const analysis = await runChild("scripts/analyze-form-worker.mjs", ["--campaign", campaignId, "--limit", String(batchSize)]);
  const submission = await runChild("scripts/form-worker.mjs", ["--campaign", campaignId, "--limit", String(batchSize)]);
  state.lastCycleAt = new Date();
  state.cycles += 1;
  if (!analysis.ok || !submission.ok) state.lastError = "child_worker_failed";
  else state.lastError = null;
}

createServer(async (request, response) => {
  if (request.url !== "/health" && request.url !== "/healthz") {
    response.writeHead(404).end();
    return;
  }
  try {
    const metrics = await counts();
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, ...state, ...metrics }));
  } catch {
    response.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: false }));
  }
}).listen(port, "0.0.0.0");

console.log(`form automation supervisor started; poll=${intervalMs}ms batch=${batchSize}`);
while (true) {
  try { await cycle(); } catch (error) { state.lastError = error instanceof Error ? error.name : "worker_cycle_failed"; }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
