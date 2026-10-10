/**
 * Durable rendered-form analysis worker.
 *
 * This is a separate Node process. It is never imported by Next/OpenNext and
 * never runs in Cloudflare workerd. It claims form_analysis_jobs with SKIP
 * LOCKED, invokes scripts/analyze-form.mjs, and persists only field metadata
 * and safe diagnostics.
 *
 * Usage:
 *   node scripts/analyze-form-worker.mjs --once
 *   node scripts/analyze-form-worker.mjs --limit 10
 *   node scripts/analyze-form-worker.mjs --recover --stale-min 15
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
import { safeBrowserError } from "./form-worker-diagnostics.mjs";

config({ path: ".env.local" });
config({ path: ".env" });

if ((process.env.NEON_BRANCH ?? "").toLowerCase() === "production") {
  console.error("REFUSED: NEON_BRANCH=production. Analysis worker is development-only.");
  process.exit(1);
}

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const limit = Math.max(1, Math.min(Number(flag("--limit") ?? (has("--once") ? 1 : 10)), 50));
const workerRunId = randomUUID();
const staleMinutes = Math.max(5, Number(flag("--stale-min") ?? 15));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 2,
});

function backoff(attempts) {
  return Math.min(15 * 60, 2 ** Math.max(0, attempts) * 5);
}

function inferMapping(fields) {
  const mapping = {};
  for (const field of fields) {
    const label = String(field.label ?? "").toLowerCase();
    const type = String(field.type ?? "").toLowerCase();
    const source = label + " " + type;
    if (source.includes("email")) mapping[field.name] = "email";
    else if (source.includes("phone") || source.includes("mobile") || source.includes("tel")) mapping[field.name] = "phone";
    else if (source.includes("first") && source.includes("name")) mapping[field.name] = "firstName";
    else if (source.includes("last") && source.includes("name")) mapping[field.name] = "lastName";
    else if (source.includes("full name")) mapping[field.name] = "firstName";
  }
  return mapping;
}

async function claimOne(client) {
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    const result = await client.query(
      `select j.id, j.org_id, j.campaign_id, j.form_url, j.attempts, j.max_attempts, o.plan_key
         from public.form_analysis_jobs j
         join public.organizations o on o.id = j.org_id
        where j.status = 'queued'
          and j.next_attempt_at <= now()
        order by j.created_at
        limit 1
        for update of j skip locked`,
    );
    if (result.rows.length === 0) {
      await client.query("rollback");
      return null;
    }
    const job = result.rows[0];
    const updated = await client.query(
      `update public.form_analysis_jobs
          set status = 'processing',
              attempts = attempts + 1,
              locked_at = now(),
              locked_by = $2,
              started_at = coalesce(started_at, now()),
              updated_at = now()
        where id = $1::uuid
        returning id, org_id, campaign_id, form_url, attempts, max_attempts`,
      [job.id, workerRunId],
    );
    await client.query("commit");
    return updated.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function recoverStale(client) {
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    const result = await client.query(
      `update public.form_analysis_jobs
          set status = 'queued',
              locked_at = null,
              locked_by = null,
              next_attempt_at = now(),
              updated_at = now()
        where status = 'processing'
          and locked_at < now() - ($1::int * interval '1 minute')
        returning id`,
      [staleMinutes],
    );
    await client.query("commit");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

function runBrowserAnalysis(url) {
  return new Promise((resolve, reject) => {
    const helper = fileURLToPath(new URL("./analyze-form.mjs", import.meta.url));
    execFile(process.execPath, [helper, url], { timeout: 100_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(safeBrowserError(stderr || error)));
        return;
      }
      try {
        resolve(JSON.parse(String(stdout)));
      } catch {
        reject(new Error("Browser analysis returned an unreadable result"));
      }
    });
  });
}

async function finish(client, job, outcome) {
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    await client.query(
      `update public.form_analysis_jobs
          set status = $2,
              last_error = $3,
              diagnostics = $4::jsonb,
              result = $5::jsonb,
              completed_at = case when $2 in ('ready','needs_attention','failed') then now() else null end,
              locked_at = null,
              locked_by = null,
              updated_at = now(),
              next_attempt_at = case when $2 = 'queued' then now() + ($6::int * interval '1 second') else next_attempt_at end
        where id = $1::uuid`,
      [job.id, outcome.status, outcome.error ?? null, JSON.stringify(outcome.diagnostics ?? []), JSON.stringify(outcome.result ?? {}), outcome.backoffSeconds ?? 0],
    );

    const campaignStatus =
      outcome.status === "ready" ? "ready" :
      outcome.status === "queued" ? "queued" :
      outcome.status === "needs_attention" ? "needs_attention" : "failed";
    await client.query(
      `update public.campaigns
          set form_url = $2,
              form_definition = case when $3 = 'ready' then $4::jsonb else form_definition end,
              field_mapping = case when $3 = 'ready' then $5::jsonb else field_mapping end,
              form_analysis_status = $3,
              form_analysis_error = $6,
              form_analysis_updated_at = now(),
              updated_at = now()
        where id = $1::uuid`,
      [job.campaign_id, job.form_url, campaignStatus, JSON.stringify(outcome.fields ?? []), JSON.stringify(outcome.mapping ?? {}), outcome.error ?? null],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function processJob(client, job) {
  try {
    const analyzed = await runBrowserAnalysis(job.form_url);
    const diagnostics = Array.isArray(analyzed.diagnostics) ? analyzed.diagnostics.slice(0, 10) : [];
    const fields = Array.isArray(analyzed.fields) ? analyzed.fields : [];
    const state = analyzed.state ?? (fields.length > 0 && diagnostics.length === 0 ? "ready" : "needs_attention");
    if (analyzed.analysisMode === "dynamic-sections" && !["pro", "plus", "business"].includes(job.plan_key)) {
      await finish(client, job, { status: "needs_attention", error: "Multi-page forms are available on Pro and Plus. No destination navigation was attempted.", diagnostics: ["upgrade_required_multi_page"], result: { provider: "google", state: "needs_attention", analysisMode: analyzed.analysisMode } });
      return;
    }
    if (state === "human_action_required") {
      await finish(client, job, {
        status: "needs_attention",
        error: "Human action required: the destination presented a verification challenge.",
        diagnostics: ["human_action_required"],
        result: { provider: "google", state, analysisMode: analyzed.analysisMode ?? "dynamic-sections", warnings: analyzed.warnings ?? [], navigation: analyzed.navigation ?? null },
      });
      return;
    }
    if (state !== "ready" || fields.length === 0) {
      await finish(client, job, {
        status: "needs_attention",
        error: diagnostics[0] ?? "The rendered form could not be analyzed unambiguously.",
        diagnostics,
        result: { provider: "google", state, analysisMode: analyzed.analysisMode ?? "dynamic-sections", warnings: analyzed.warnings ?? [], navigation: analyzed.navigation ?? null },
      });
      return;
    }
    await finish(client, job, {
      status: "ready",
      fields,
      mapping: inferMapping(fields),
      diagnostics,
      result: { provider: "google", state, fieldCount: fields.length, analysisMode: analyzed.analysisMode ?? "single-page", warnings: analyzed.warnings ?? [], navigation: analyzed.navigation ?? null },
    });
  } catch (error) {
    const message = safeBrowserError(error);
    const permanent = /challenge|captcha|otp|one-time|sign.?in|ambiguous|unsupported|not allowed|credentials/i.test(message);
    const exhausted = Number(job.attempts) >= Number(job.max_attempts);
    await finish(client, job, {
      status: permanent || exhausted ? "failed" : "queued",
      error: message,
      diagnostics: [permanent ? "human_action_required_or_unsupported" : "transient_error"],
      result: {},
      backoffSeconds: permanent || exhausted ? 0 : backoff(Number(job.attempts)),
    });
  }
}

async function main() {
  const client = await pool.connect();
  try {
    if (has("--recover")) {
      const recovered = await recoverStale(client);
      console.log(`recovered=${recovered}`);
    }
    let processed = 0;
    for (; processed < limit; processed += 1) {
      const job = await claimOne(client);
      if (!job) break;
      await processJob(client, job);
      console.log(`analysis job processed: ${job.id}`);
    }
    console.log(`processed=${processed}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(safeBrowserError(error));
  process.exitCode = 1;
});
