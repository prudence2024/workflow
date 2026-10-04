/**
 * Real form-submission worker (Node + Playwright, never Cloudflare Workers).
 *
 * Claims queued campaign_records durably (FOR UPDATE SKIP LOCKED), fills the
 * AUTHORIZED destination form in Chromium, submits, and writes an outcome
 * ONLY on destination-observed evidence:
 *   - explicit confirmation  -> successful + submission_evidence
 *   - CAPTCHA/OTP/sign-in    -> human_action_required (never retried)
 *   - ambiguous post-submit  -> needs_attention (never auto-retried)
 *   - transient failure      -> retrying with exponential backoff (max 3)
 *   - validation/exhausted   -> failed
 *
 * Safety: serial execution (concurrency 1, one domain at a time), claim is
 * the execution lock (no double-submit), successful rows are never
 * re-claimed, stale `processing` rows are recovered explicitly via
 * --recover, never silently.
 *
 * Usage:
 *   node scripts/form-worker.mjs --campaign <uuid> [--limit N] [--dry-run]
 *   node scripts/form-worker.mjs --record <uuid> [--dry-run]
 *   node scripts/form-worker.mjs --recover [--stale-min 15]
 *
 * Requires migration 0008 (worker campaign policies, evidence columns).
 * Browsers: pre-installed ms-playwright cache (PLAYWRIGHT_CHROME_PATH
 * override supported). Never test against production (NEON_BRANCH guard).
 */
import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { existsSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "dotenv";
import pg from "pg";
import { chromium } from "playwright-core";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const has = (name) => args.includes(name);

const RUN_ID = randomUUID().slice(0, 8);
const MAX_ATTEMPTS = 3;

if ((process.env.NEON_BRANCH ?? "").toLowerCase() === "production") {
  console.error("REFUSED: NEON_BRANCH=production. This worker is development-only in this milestone.");
  process.exit(1);
}

// --- URL safety (mirrors src/lib/formUrlPolicy.ts; worker is plain JS) ---
const dnsLookupAsync = promisify(dnsLookup);
function ipBlocked(ip) {
  if (ip === "169.254.169.254" || ip === "100.100.100.200") return true;
  if (isIP(ip) === 4) {
    const n = ip.split(".").reduce((a, p) => a * 256 + Number(p), 0) >>> 0;
    const b0 = (n >>> 24) & 0xff, b1 = (n >>> 16) & 0xff;
    if (b0 === 10 || b0 === 127 || (b0 === 172 && b1 >= 16 && b1 <= 31) ||
        (b0 === 192 && b1 === 168) || (b0 === 169 && b1 === 254) ||
        b0 === 0 || b0 >= 224 || (b0 === 100 && b1 >= 64 && b1 <= 127)) return true;
    return false;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fe80:") || l.startsWith("fc") ||
    l.startsWith("fd") || l.startsWith("ff");
}
async function assertUrlAllowed(raw) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s) allowed");
  if (u.username || u.password) throw new Error("credentials in URL are not allowed");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") ||
      host.endsWith(".local") || (!host.includes(".") && isIP(host) === 0)) {
    throw new Error("internal hostnames are not allowed");
  }
  if (isIP(host) !== 0) {
    if (ipBlocked(host)) throw new Error("that address is not allowed");
    return u.toString();
  }
  const addrs = (await dnsLookupAsync(host, { all: true })).map((r) => r.address);
  if (addrs.length === 0 || addrs.some(ipBlocked)) throw new Error("host resolves to a disallowed address");
  return u.toString();
}

function resolveChromePath() {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return process.env.PLAYWRIGHT_CHROME_PATH;
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  for (const entry of readdirSync(cache)) {
    if (!entry.startsWith("chromium-") || entry.includes("headless-shell")) continue;
    for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]) {
      const c = join(cache, entry, sub);
      if (existsSync(c)) return c;
    }
  }
  throw new Error("No Playwright Chromium found");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 2,
});

async function requireWorkerAccess(client) {
  const cols = await client.query(
    `select count(*)::int n from information_schema.columns where table_schema='public'
      and ((table_name='campaign_records' and column_name in ('submission_evidence','next_attempt_at'))
        or (table_name='organizations' and column_name='workspace_type'))`
  );
  if (cols.rows[0].n !== 3) throw new Error("migration 0008 is not applied on this branch");
  const pol = await client.query(
    `select count(*)::int n from pg_policies where schemaname='public' and policyname like 'worker_campaign%'`
  );
  if (pol.rows[0].n < 4) throw new Error("worker campaign policies are missing (migration 0008)");
}

/** Claim one due record as the worker role. The claim IS the execution lock. */
async function claimOne(client, campaignId) {
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    const params = [];
    let campaignFilter = "";
    if (campaignId) {
      params.push(campaignId);
      campaignFilter = `and r.campaign_id = $1::uuid`;
    }
    const res = await client.query(
      `select r.id, r.org_id, r.campaign_id, r.contact_id, r.attempts, c.form_definition, o.plan_key
         from public.campaign_records r
         join public.campaigns c on c.id = r.campaign_id
         join public.organizations o on o.id = r.org_id
        where c.status = 'running'
          ${campaignFilter}
          and (r.status = 'queued'
            or (r.status = 'retrying' and (r.next_attempt_at is null or r.next_attempt_at <= now())))
        order by r.created_at
        limit 1
        for update of r skip locked`,
      params,
    );
    if (res.rows.length === 0) {
      await client.query("rollback");
      return null;
    }
    const rec = res.rows[0];
    await client.query(
      `update public.campaign_records
          set status = 'processing', attempts = attempts + 1, last_attempt_at = now(), updated_at = now()
        where id = $1::uuid`,
      [rec.id],
    );
    const camp = await client.query(
      `select id, form_url, form_definition, field_mapping from public.campaigns where id = $1::uuid`,
      [rec.campaign_id],
    );
    const contact = await client.query(
      `select id, first_name, last_name, email, phone, company, address, custom_fields
         from public.contacts where id = $1::uuid`,
      [rec.contact_id],
    );
    await client.query("commit");
    return { rec, campaign: { ...camp.rows[0], plan_key: rec.plan_key }, contact: contact.rows[0] ?? null };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

async function writeOutcome(client, rec, patch) {
  if (patch.status === 'successful') {
    const e = patch.evidence;
    if (!e || typeof e.provider !== 'string' || typeof e.submittedAt !== 'string' || typeof e.finalUrl !== 'string' || typeof e.confirmationType !== 'string' || typeof e.workerRunId !== 'string' || typeof e.attemptId !== 'string') {
      throw new Error('Refusing successful outcome without destination evidence');
    }
  }
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    await client.query(
      `update public.campaign_records set
         status = $2, failure_category = $3, result_message = $4,
         submission_evidence = coalesce($5::jsonb, submission_evidence),
         next_attempt_at = $6, updated_at = now()
       where id = $1::uuid`,
      [rec.id, patch.status, patch.failureCategory ?? null, patch.message,
       patch.evidence ? JSON.stringify(patch.evidence) : null, patch.nextAttemptAt ?? null],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

async function recompute(client, campaignId) {
  await client.query("begin");
  try {
    await client.query("set local role workflow_worker");
    const rows = await client.query(
      `select status, count(*)::int n from public.campaign_records where campaign_id = $1::uuid group by 1`,
      [campaignId],
    );
    const stats = { total: 0 };
    for (const r of rows.rows) {
      stats[r.status] = r.n;
      stats.total += r.n;
    }
    await client.query(`update public.campaigns set stats = $2::jsonb, updated_at = now() where id = $1::uuid`, [campaignId, JSON.stringify(stats)]);
    const pending = (stats.queued ?? 0) + (stats.retrying ?? 0) + (stats.processing ?? 0);
    if (pending === 0) {
      await client.query(`update public.campaigns set status = 'completed', updated_at = now() where id = $1::uuid and status = 'running'`, [campaignId]);
    }
    await client.query("commit");
    return stats;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function contactValue(contact, column) {
  if (!column) return "";
  if (column.startsWith("custom__")) {
    const key = column.slice("custom__".length);
    return String(contact?.custom_fields?.[key] ?? "");
  }
  const map = { firstName: "first_name", lastName: "last_name", email: "email", phone: "phone", company: "company", address: "address" };
  const direct = map[column] ?? column;
  if (contact && direct in contact) return String(contact[direct] ?? "");
  if (column === "name" || column === "fullName") {
    return `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim();
  }
  return String(contact?.[column] ?? "");
}

async function detectChallenge(page) {
  return page.evaluate(() => {
    const body = (document.body.innerText || "").toLowerCase();
    if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="captcha"]')) {
      return "Destination presented a CAPTCHA challenge — human action required";
    }
    if (body.includes("sign in to continue") || body.includes("you need permission")) {
      return "Destination requires sign-in or permission — human action required";
    }
    if (body.includes("no longer accepting responses")) return "Destination form is closed to new responses";
    return null;
  });
}

const MAX_FORM_STEPS = 25;

function isDynamicFormDefinition(definition) {
  return Array.isArray(definition) && definition.some((field) => Number(field?.pageIndex ?? 0) > 0 || Boolean(field?.branchGroup));
}

function isPaidMultiPagePlan(planKey) {
  return planKey === "pro" || planKey === "plus" || planKey === "business";
}

async function visibleSnapshot(page) {
  return page.evaluate(() => {
    const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visible = (element) => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && !element.hasAttribute("aria-hidden"); };
    const items = Array.from(document.querySelectorAll('div[role="listitem"]')).filter(visible).map((li) => {
      const controls = Array.from(li.querySelectorAll("input, textarea, [role=radio], [role=checkbox], [role=listbox]"));
      const first = controls[0];
      const providerFieldId = controls.map((control) => control.getAttribute("name")).find((name) => name?.startsWith("entry.")) ?? null;
      return { label: norm(li.textContent).replace(/\s*\*.*$/, "").slice(0, 120) || "Unnamed question", required: /\*/.test(norm(li.textContent).slice(0, 125)), type: first?.getAttribute("type") || first?.getAttribute("role") || (first?.tagName.toLowerCase() ?? "unknown"), providerFieldId, options: Array.from(li.querySelectorAll('[role=radio], [role=checkbox], [role=option]')).map((option) => norm(option.textContent || option.getAttribute("aria-label"))).filter(Boolean).slice(0, 50) };
    });
    const controls = Array.from(document.querySelectorAll('[role=button], button')).filter(visible).map((element) => norm(element.textContent || element.getAttribute("aria-label"))).filter(Boolean);
    const sectionTitle = norm(document.querySelector('[role=heading], h1, h2, h3')?.textContent).slice(0, 120) || "Form section";
    const body = norm(document.body?.innerText).slice(0, 5000);
    return { items, hasNext: controls.some((text) => /^(next|continue|proceed|go to next)$/i.test(text)), hasSubmit: controls.some((text) => /^(submit|send|finish|complete)$/i.test(text)), sectionTitle, pageSignature: `${location.href}|${sectionTitle}|${items.map((item) => `${item.providerFieldId ?? item.label}:${item.type}`).join("|")}`.slice(0, 800), challenge: /captcha|recaptcha|verify you are human|one[- ]time password|\botp\b|sign in to continue/i.test(body) || Boolean(document.querySelector('iframe[src*="recaptcha"], [aria-label*="CAPTCHA" i]')) };
  });
}

function mappingForField(field, mapping) {
  return mapping[field.name] ?? mapping[field.providerFieldId] ?? mapping[field.label] ?? mapping[field.label?.toLowerCase()];
}

async function fillVisibleField(page, field, value) {
  return page.evaluate(({ label, providerFieldId, value: answer }) => {
    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    const items = Array.from(document.querySelectorAll('div[role="listitem"]'));
    const item = items.find((candidate) => {
      if (candidate.querySelector(`[name="${providerFieldId ?? "__missing__"}"]`)) return true;
      return norm(candidate.textContent).startsWith(norm(label));
    });
    if (!item) return "missing";
    const input = item.querySelector('textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input:not([type])');
    if (input) {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, answer);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    }
    const options = Array.from(item.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]'));
    const choice = options.find((option) => norm(option.textContent || option.getAttribute("aria-label")) === norm(answer));
    if (choice) { choice.click(); return "filled"; }
    return "unsupported";
  }, { label: field.label, providerFieldId: field.providerFieldId ?? null, value });
}

async function clickNavigation(page, kind) {
  return page.evaluate((wanted) => {
    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
    const patterns = wanted === "submit" ? /^(submit|send|finish|complete)$/ : /^(next|continue|proceed|go to next)$/;
    const button = buttons.find((candidate) => patterns.test(norm(candidate.textContent || candidate.getAttribute("aria-label"))));
    if (!button) return false;
    button.click();
    return true;
  }, kind);
}

async function processRecord(browser, job) {
  const { rec, campaign, contact } = job;
  const attemptId = `${RUN_ID}-a${rec.attempts + 1}`;
  if (isDynamicFormDefinition(campaign.form_definition) && !isPaidMultiPagePlan(campaign.plan_key)) {
    return { status: "needs_attention", message: "Multi-page forms are available on Pro and Plus. No destination navigation was attempted.", failureCategory: "policy" };
  }
  const fail = async (message, category, retryable = false) => {
    if (retryable && rec.attempts + 1 < MAX_ATTEMPTS) {
      const mins = 2 ** rec.attempts;
      return { status: "retrying", message: `${message} (retry in ~${mins}m)`, failureCategory: category, nextAttemptAt: new Date(Date.now() + mins * 60_000).toISOString() };
    }
    return { status: "failed", message, failureCategory: category ?? "exhausted" };
  };
  if (!contact) return fail("Contact no longer exists — cannot submit.", "invalid_data");
  let formUrl;
  try { formUrl = await assertUrlAllowed(campaign.form_url); } catch (err) { return fail(`Destination URL rejected by safety policy: ${err.message}`, "policy"); }
  const fields = campaign.form_definition ?? [];
  const mapping = campaign.field_mapping ?? {};
  if (fields.length === 0) return fail("Campaign has no analyzed form definition — analyze the form first.", "config");
  const values = {};
  for (const field of fields) {
    const column = mappingForField(field, mapping);
    const value = column ? contactValue(contact, column).trim() : "";
    if (field.required && !value && (field.pageIndex ?? 0) === 0) return fail(`Required field '${field.label}' has no mapped contact value.`, "validation");
    if (field.type === "email" && value && !EMAIL_RE.test(value)) return fail(`Invalid email for '${field.label}'.`, "validation");
    if (value) values[field.name] = value;
  }

  const page = await browser.newPage();
  await page.route("**/*", async (route) => { try { await assertUrlAllowed(route.request().url()); await route.continue(); } catch { await route.abort(); } });
  let finalSubmissionAttempted = false;
  const visited = new Set();
  const sectionPath = [];
  try {
    await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("form", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    for (let step = 0; step < MAX_FORM_STEPS; step += 1) {
      const snapshot = await visibleSnapshot(page);
      if (snapshot.challenge) return { status: "human_action_required", message: "Destination presented a verification or authentication challenge." };
      if (visited.has(snapshot.pageSignature)) return { status: "needs_attention", message: "The destination repeated a form section unexpectedly; manual review is required.", pagesVisited: step, finalStep: step, sectionPath };
      visited.add(snapshot.pageSignature);
      sectionPath.push(snapshot.sectionTitle);
      for (const visible of snapshot.items) {
        const known = fields.find((field) => (visible.providerFieldId && field.providerFieldId === visible.providerFieldId) || field.label.toLowerCase() === visible.label.toLowerCase());
        const field = known ?? { name: visible.providerFieldId ?? `dynamic_${step}_${snapshot.items.indexOf(visible)}`, label: visible.label, type: visible.type, required: visible.required, providerFieldId: visible.providerFieldId, pageIndex: step, sectionTitle: snapshot.sectionTitle };
        const column = mappingForField(field, mapping);
        const value = column ? contactValue(contact, column).trim() : values[field.name] ?? "";
        if (field.required && !value) return { status: "needs_attention", message: `Required field '${field.label}' on '${snapshot.sectionTitle}' has no mapped contact value.`, pagesVisited: step + 1, finalStep: step, sectionPath };
        if (!value) continue;
        if (field.type === "email" && !EMAIL_RE.test(value)) return fail(`Invalid email for '${field.label}'.`, "validation");
        const result = await fillVisibleField(page, field, value);
        if (result === "missing") return { status: "needs_attention", message: `Question '${field.label}' changed on the destination form.`, pagesVisited: step + 1, finalStep: step, sectionPath };
        if (result === "unsupported") return { status: "human_action_required", message: `Question '${field.label}' needs an unsupported control.`, pagesVisited: step + 1, finalStep: step, sectionPath };
      }
      if (snapshot.hasSubmit) {
        finalSubmissionAttempted = true;
        const clicked = await clickNavigation(page, "submit");
        if (!clicked) return { status: "needs_attention", message: "The final Submit control disappeared before it could be attempted.", pagesVisited: step + 1, finalStep: step, sectionPath };
        const markers = ["your response has been recorded", "submit another response"];
        let confirmed = false;
        try { await page.waitForFunction((wanted) => { const body = (document.body.innerText || "").toLowerCase(); return wanted.some((marker) => body.includes(marker)); }, markers, { timeout: 30_000 }); confirmed = true; } catch { confirmed = false; }
        if (!confirmed) return { status: "needs_attention", message: "Final submission was attempted, but no explicit destination confirmation was observed.", pagesVisited: step + 1, finalStep: step, sectionPath };
        const excerpt = ((await page.evaluate(() => document.body.innerText)) || "").replace(/\s+/g, " ").trim().slice(0, 200);
        return { status: "successful", message: "Submitted and confirmed by the destination.", evidence: { provider: "google", submittedAt: new Date().toISOString(), finalUrl: page.url(), confirmationType: "recorded-confirmation", confirmationExcerpt: excerpt, workerRunId: RUN_ID, attemptId, pagesVisited: step + 1, finalStep: step, sectionPath } };
      }
      if (!snapshot.hasNext) return { status: "needs_attention", message: "No Next or final Submit control was found; manual review is required.", pagesVisited: step + 1, finalStep: step, sectionPath };
      const before = snapshot.pageSignature;
      if (!await clickNavigation(page, "next")) return { status: "needs_attention", message: "The form section has no usable Next control.", pagesVisited: step + 1, finalStep: step, sectionPath };
      try { await page.waitForFunction((oldSignature) => { const title = (document.querySelector('[role="heading"], h1, h2, h3')?.textContent || "").replace(/\s+/g, " ").trim(); const labels = Array.from(document.querySelectorAll('div[role="listitem"]')).map((item) => (item.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)).join("|"); return `${location.href}|${title}|${labels}`.slice(0, 800) !== oldSignature; }, before, { timeout: 10_000 }); } catch { return { status: "needs_attention", message: "The form did not progress after Next; manual review is required.", pagesVisited: step + 1, finalStep: step, sectionPath }; }
    }
    return { status: "needs_attention", message: `Form exceeded the maximum of ${MAX_FORM_STEPS} sections; manual review is required.`, pagesVisited: MAX_FORM_STEPS, finalStep: MAX_FORM_STEPS - 1, sectionPath };
  } catch (err) {
    const message = err.message ?? String(err);
    if (finalSubmissionAttempted) return { status: "needs_attention", message: `Submission outcome is ambiguous after the final attempt — manual review required: ${message.slice(0, 160)}` };
    if (/timeout|net::|navigation/i.test(message)) return fail(`Transient browser/network failure: ${message.slice(0, 160)}`, "network_failure", true);
    return { status: "needs_attention", message: `Unexpected worker error — parked for human review: ${message.slice(0, 160)}` };
  } finally { await page.close().catch(() => {}); }
}
function resolveChrome() {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return process.env.PLAYWRIGHT_CHROME_PATH;
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  for (const entry of readdirSync(cache)) {
    if (!entry.startsWith("chromium-") || entry.includes("headless-shell")) continue;
    for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]) {
      const c = join(cache, entry, sub);
      if (existsSync(c)) return c;
    }
  }
  throw new Error("No Playwright Chromium found");
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  });
  await client.connect();
  try {
    await requireWorkerAccess(client);

    if (has("--recover")) {
      const mins = Number(flag("--stale-min") ?? 15);
      const res = await client.query(
        `update public.campaign_records set status = 'needs_attention', result_message = 'Worker stopped while processing; external outcome is unknown. Review before any retry.', failure_category = 'ambiguous', updated_at = now()
          where status = 'processing' and last_attempt_at < now() - ($1 || ' minutes')::interval`,
        [String(mins)],
      );
      console.log(`recovered ${res.rowCount} stale processing row(s) to queued.`);
      return;
    }

    const dry = has("--dry-run");
    const onlyRecord = flag("--record");
    const onlyCampaign = flag("--campaign");
    const limit = Number(flag("--limit") ?? (onlyRecord ? 1 : 10));
    let browser = null;
    try {
      let done = 0;
      const touchedCampaigns = new Set();
      for (;;) {
        if (done >= limit) break;
        let job = null;
        if (onlyRecord && done === 0) {
          await client.query("begin");
          try {
            await client.query("set local role workflow_worker");
            const r = await client.query(
              `select r.id, r.org_id, r.campaign_id, r.contact_id, r.attempts, c.form_definition, o.plan_key
                 from public.campaign_records r join public.campaigns c on c.id = r.campaign_id
                 join public.organizations o on o.id = r.org_id
                where r.id = $1::uuid and c.status = 'running'
                  and r.status in ('queued','retrying') for update of r skip locked`,
              [onlyRecord],
            );
            if (r.rows.length > 0) {
              const rec = r.rows[0];
              await client.query(
                `update public.campaign_records set status='processing', attempts=attempts+1, last_attempt_at=now(), updated_at=now() where id=$1::uuid`,
                [rec.id],
              );
              const camp = await client.query(`select id, form_url, form_definition, field_mapping from public.campaigns where id=$1::uuid`, [rec.campaign_id]);
              const contact = await client.query(`select id, first_name, last_name, email, phone, company, address, custom_fields from public.contacts where id=$1::uuid`, [rec.contact_id]);
              await client.query("commit");
              job = { rec, campaign: { ...camp.rows[0], plan_key: rec.plan_key }, contact: contact.rows[0] ?? null };
            } else {
              await client.query("rollback");
            }
          } catch (err) {
            await client.query("rollback").catch(() => {});
            throw err;
          }
        } else if (!onlyRecord) {
          job = await claimOne(client, onlyCampaign);
        }
        if (!job) break;
        touchedCampaigns.add(job.rec.campaign_id);
        const blockedByPlan = isDynamicFormDefinition(job.campaign?.form_definition) && !isPaidMultiPagePlan(job.campaign?.plan_key);
        if (blockedByPlan) {
          const outcome = { status: "needs_attention", message: "Multi-page forms are available on Pro and Plus. No destination navigation was attempted.", failureCategory: "policy" };
          await writeOutcome(client, job.rec, outcome);
          console.log(`${outcome.status}: record ${job.rec.id} — ${outcome.message}`);
          done += 1;
          continue;
        }
        if (dry) {
          console.log(`dry-run: would process record ${job.rec.id} (attempt ${job.rec.attempts + 1})`);
          await client.query("begin");
          try {
            await client.query("set local role workflow_worker");
            await client.query(
              `update public.campaign_records set status='queued', attempts=attempts-1 where id=$1::uuid`,
              [job.rec.id],
            );
            await client.query("commit");
          } catch {
            await client.query("rollback").catch(() => {});
          }
          done += 1;
          continue;
        }
        if (!browser) browser = await chromium.launch({ executablePath: resolveChrome() });
        const outcome = await processRecord(browser, job);
        await writeOutcome(client, job.rec, outcome);
        console.log(`${outcome.status}: record ${job.rec.id} — ${outcome.message.slice(0, 120)}`);
        done += 1;
      }
      for (const cid of touchedCampaigns) {
        if (!dry) {
          const stats = await recompute(client, cid);
          console.log(`campaign ${cid} stats: ${JSON.stringify(stats)}`);
        }
      }
      console.log(`run ${RUN_ID}: processed ${done} record(s).`);
    } finally {
      await browser?.close().catch(() => {});
    }
  } finally {
    await pool.end().catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`WORKER FAILED: ${err.message}`);
  process.exitCode = 1;
});
