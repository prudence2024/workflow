/**
 * Resend transactional-email acceptance test (NO payment, NO real customer).
 *
 * Sends a single test message from the locally configured RESEND_FROM_EMAIL
 * to Resend's safe test inbox `delivered@resend.dev`, which the provider
 * accepts for any account regardless of custom-domain verification.
 *
 * Never prints the API key or the configured sender value.
 * Read-only with respect to application data: no DB writes, no receipts.
 */
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const readEnv = (name) => envText.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();

const apiKey = readEnv("RESEND_API_KEY");
const from = readEnv("RESEND_FROM_EMAIL");

if (!apiKey) {
  console.log("RESEND_API_KEY_MISSING_LOCAL=YES");
  process.exit(1);
}
if (!from) {
  console.log("RESEND_FROM_EMAIL_MISSING_LOCAL=YES");
  process.exit(1);
}

console.log("LOCAL_RESEND_CONFIG_PRESENT=YES");
console.log("TO=delivered@resend.dev (safe provider test inbox)");

const result = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: "delivered@resend.dev",
    subject: "Diplomat Global — receipt email acceptance test",
    html: "<p>Transactional email chain acceptance test. No customer action required.</p>",
    text: "Transactional email chain acceptance test. No customer action required.",
  }),
});

console.log(`HTTP_STATUS=${result.status}`);
const body = await result.json().catch(() => ({}));
if (result.ok) {
  console.log(`RESEND_REQUEST=PASS`);
  console.log(`RESEND_MESSAGE_ID_PRESENT=${body.id ? "YES" : "NO"}`);
  if (body.id) console.log(`MESSAGE_ID=${body.id}`);
} else {
  console.log(`RESEND_REQUEST=FAIL`);
  console.log(`RESEND_MESSAGE_ID_PRESENT=NO`);
  console.log(`RESEND_PROVIDER_ERROR=${JSON.stringify(body).slice(0, 300)}`);
}
