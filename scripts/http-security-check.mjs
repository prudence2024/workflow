/**
 * HTTP-level security checks against a locally running Workflow server.
 *
 * Usage: node scripts/http-security-check.mjs
 *
 * These are end-to-end: the app is started for real and requests are made over
 * HTTP, so route protection and webhook verification are exercised as they ship
 * rather than as isolated functions.
 *
 * It asserts what can be proven without third-party credentials:
 *   - protected application routes redirect anonymous visitors to sign-in;
 *   - every webhook rejects requests that lack a valid signature;
 *   - a CORRECTLY signed Resend webhook is accepted and processed;
 *   - a replayed delivery is deduplicated rather than applied twice.
 *
 * Authenticated, multi-tenant HTTP flows additionally require Clerk test keys
 * and are reported as NOT RUN by this script.
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const PORT = 3939;
const BASE = `http://127.0.0.1:${PORT}`;
const RESEND_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const TELEGRAM_SECRET = "test-telegram-secret-token";
const TERMII_SECRET = "test-termii-secret";

const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "-p", String(PORT)],
  {
    env: {
      ...process.env,
      RESEND_WEBHOOK_SIGNING_SECRET: RESEND_SECRET,
      TELEGRAM_WEBHOOK_SECRET: TELEGRAM_SECRET,
      TELEGRAM_ALLOWED_CHAT_IDS: "424242",
      TERMII_WEBHOOK_SECRET: TERMII_SECRET,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  },
);

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function signResend(body, id, timestamp) {
  const key = Buffer.from(RESEND_SECRET.replace(/^whsec_/, ""), "base64");
  return crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

async function main() {
  const up = await waitForServer();
  if (!up) {
    record("server started", false, "timed out waiting for /api/health");
    return;
  }
  record("server started", true);

  // 1. Anonymous visitors must not reach protected application routes.
  for (const path of ["/dashboard", "/contacts", "/campaigns", "/imports", "/platform-admin"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    const blocked = res.status === 307 || res.status === 302;
    record(
      `anonymous GET ${path} blocked`,
      blocked && location.includes("/login"),
      `status=${res.status} location=${location || "-"}`,
    );
  }

  // 2. Webhooks reject unsigned requests.
  const unsignedResend = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email.delivered", data: { email_id: "nope" } }),
  });
  record("unsigned resend webhook rejected", unsignedResend.status === 401, `status=${unsignedResend.status}`);

  const badSignature = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": "msg_forged",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    },
    body: JSON.stringify({ type: "email.delivered", data: { email_id: "nope" } }),
  });
  record("forged resend signature rejected", badSignature.status === 401, `status=${badSignature.status}`);

  const telegramNoSecret = await fetch(`${BASE}/api/webhooks/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ update_id: 1, message: { chat: { id: 424242 }, text: "/status" } }),
  });
  record("telegram webhook without secret rejected", telegramNoSecret.status === 401, `status=${telegramNoSecret.status}`);

  const termiiNoSecret = await fetch(`${BASE}/api/webhooks/termii`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: "x", status: "delivered" }),
  });
  record("termii webhook without secret rejected", termiiNoSecret.status === 401, `status=${termiiNoSecret.status}`);

  // 3. A correctly signed webhook is accepted end-to-end.
  const eventId = `msg_httpsig_${Date.now()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({
    type: "email.delivered",
    data: { email_id: `unknown_provider_id_${Date.now()}`, to: ["someone@example.test"] },
  });
  const signature = signResend(payload, eventId, timestamp);

  const signedRes = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: payload,
  });
  const signedBody = await signedRes.json().catch(() => ({}));
  record(
    "correctly signed resend webhook accepted",
    signedRes.status === 200 && signedBody.ok === true,
    `status=${signedRes.status} body=${JSON.stringify(signedBody)}`,
  );

  // 4. Replaying the same delivery must not re-apply it.
  const replay = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: payload,
  });
  const replayBody = await replay.json().catch(() => ({}));
  record(
    "replayed delivery deduplicated",
    replay.status === 200 && replayBody.duplicate === true,
    `status=${replay.status} body=${JSON.stringify(replayBody)}`,
  );
}

main()
  .catch((err) => record("http security checks completed", false, err.message))
  .finally(async () => {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    const failed = results.filter((r) => !r.pass).length;
    console.log("");
    console.log(`SUMMARY: ${results.length - failed}/${results.length} checks passed`);
    console.log("NOT RUN: authenticated multi-tenant HTTP flows (require Clerk test-mode keys).");
    process.exit(failed === 0 ? 0 : 1);
  });
