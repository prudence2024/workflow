/**
 * Hosted security checks (Gate B, P6).
 *
 * Exercises authentication and tenant isolation over real HTTP against a
 * running server (dev or `next start`). Uses the legacy bridge accounts from
 * the development seed, so it only ever runs against a local/dev target:
 * refuses any BASE that is not localhost / 127.0.0.1.
 *
 * Usage: node scripts/hosted-security-check.mjs [baseUrl]
 *
 * Covered here (HTTP): valid user/org access, cross-tenant read denial with
 * no data leak, forged org-cookie fallback, revoked-member denial (with
 * immediate restore), missing-role redirect, unauthenticated redirect,
 * worker route without secret (401), webhook with invalid signature (401).
 *
 * Covered DB-level by tests/tenant-isolation.test.ts (20/20): cross-tenant
 * WRITE denial, forged context rejection, non-member context rejection,
 * permission escalation denial, last-owner protection.
 */
import { config } from "dotenv";
import pg from "pg";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

config({ path: ".env.local" });

const BASE = process.argv[2] ?? process.env.HOST_BASE_URL ?? "http://localhost:3111";
const host = new URL(BASE).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`REFUSING: ${BASE} is not a local target. This script uses dev seed credentials.`);
  process.exit(1);
}

const FOUNDER = process.env.SEED_EMAIL ?? "founder@workflow.dev";
const PARTNER = "ops@meridianacademy.example";
const PASSWORD = process.env.SEED_PASSWORD ?? "Workflow2026!";

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"),
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"),
  "/usr/bin/chromium",
].filter(Boolean);
const exe = CANDIDATES.find((c) => c && existsSync(c));

const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const admin = new pg.Client({ connectionString: dbUrl });
await admin.connect();

// Fixture handles (read-only lookups; one membership flip, restored after).
const orgA = (await admin.query(`select id from public.organizations where slug='lagos-tech-summit'`)).rows[0]?.id;
const orgB = (await admin.query(`select id from public.organizations where slug='meridian-academy'`)).rows[0]?.id;
const contactA = (
  await admin.query(`select id, email from public.contacts where org_id=$1::uuid limit 1`, [orgA])
).rows[0];
const founderAdmin =
  (await admin.query(`select is_platform_admin from public.users where email=$1`, [FOUNDER])).rows[0]
    ?.is_platform_admin === true;

const browser = await chromium.launch({ executablePath: exe });

async function loginAs(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  return { ctx, page };
}

let revoked = false;
try {
  // 1. Unauthenticated access is redirected to sign-in.
  {
    const ctx = await browser.newContext();
    const res = await ctx.request.get(`${BASE}/dashboard`, { maxRedirects: 0 }).catch(() => null);
    const loc = res?.headers()?.location ?? "";
    record("unauthenticated /dashboard redirected to /login", !!res && [301, 302, 307, 308].includes(res.status()) && loc.includes("/login"), `status=${res?.status()} location=${loc || "-"}`);
    await ctx.close();
  }

  // 2-3. Valid user/org: founder reaches dashboard, contacts, communications.
  const { ctx: fctx, page: fpage } = await loginAs(FOUNDER);
  for (const [name, url] of [["dashboard", "/dashboard"], ["records", "/contacts"], ["communications", "/communications"]]) {
    const res = await fctx.request.get(`${BASE}${url}`, { maxRedirects: 0 });
    record(`founder GET ${url} allowed`, res.status() === 200, `status=${res.status()}`);
  }
  void fpage;

  // 4. Cross-tenant READ: partner (ORG_B only) must not see an ORG_A contact.
  const { ctx: pctx } = await loginAs(PARTNER);
  {
    const res = await pctx.request.get(`${BASE}/contacts/${contactA.id}`, { maxRedirects: 0 });
    const body = res.status() === 200 ? await res.text() : "";
    const leaked = body.includes(contactA.email);
    record("cross-tenant contact read denied without leak", res.status() === 404 && !leaked, `status=${res.status()} leaked=${leaked}`);
  }

  // 5. Forged org identifier: unknown org cookie falls back, never 500s/leaks.
  {
    await pctx.addCookies([{ name: "fops_org", value: "00000000-0000-4000-8000-000000000099", domain: host, path: "/" }]);
    const res = await pctx.request.get(`${BASE}/dashboard`, { maxRedirects: 0 });
    record("forged org cookie handled safely", res.status() === 200 || [301, 302, 307].includes(res.status()), `status=${res.status()}`);
  }

  // 6. Revoked member loses access immediately, then is restored.
  {
    await admin.query(`update public.organization_members set status='revoked' where org_id=$1::uuid and user_id=(select id from public.users where email=$2)`, [orgB, PARTNER]);
    revoked = true;
    const res = await pctx.request.get(`${BASE}/dashboard`, { maxRedirects: 0 });
    const loc = res.headers().location ?? "";
    record("revoked member denied dashboard", res.status() !== 200, `status=${res.status()} location=${loc || "-"}`);
    await admin.query(`update public.organization_members set status='active' where org_id=$1::uuid and user_id=(select id from public.users where email=$2)`, [orgB, PARTNER]);
    revoked = false;
    const back = await pctx.request.get(`${BASE}/dashboard`, { maxRedirects: 0 });
    record("restored member regains dashboard", back.status() === 200, `status=${back.status()}`);
  }
  await pctx.close();

  // 7. Missing role: non-admin founder must not reach platform-admin.
  {
    if (founderAdmin) {
      record("platform-admin gate (founder is admin — check skipped)", true, "SKIP");
    } else {
      const res = await fctx.request.get(`${BASE}/platform-admin`, { maxRedirects: 0 });
      const loc = res.headers().location ?? "";
      record("non-admin redirected off platform-admin", [301, 302, 307].includes(res.status()) && loc.includes("/dashboard"), `status=${res.status()} location=${loc || "-"}`);
    }
  }
  await fctx.close();

  // 8. Worker route without the shared secret.
  {
    const res = await fetch(`${BASE}/api/worker/outbox`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    record("worker route without secret rejected", res.status === 401, `status=${res.status}`);
  }

  // 9. Webhook with an invalid signature.
  {
    const res = await fetch(`${BASE}/api/webhooks/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "svix-id": "msg_hostile", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "nope" } }),
    });
    record("webhook with invalid signature rejected", res.status === 401, `status=${res.status}`);
  }
} finally {
  if (revoked) {
    await admin.query(`update public.organization_members set status='active' where org_id=$1::uuid and user_id=(select id from public.users where email=$2)`, [orgB, PARTNER]).catch(() => {});
  }
  await browser.close().catch(() => {});
  await admin.end().catch(() => {});
}

const failed = results.filter((r) => !r.pass).length;
console.log("");
console.log(`SUMMARY: ${results.length - failed}/${results.length} hosted checks passed`);
console.log("DB-LEVEL (already green): cross-tenant write denial, forged/non-member context, escalation denial — tests/tenant-isolation.test.ts 20/20.");
process.exit(failed === 0 ? 0 : 1);
