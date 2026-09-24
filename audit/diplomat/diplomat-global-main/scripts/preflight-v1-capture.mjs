/**
 * READ-ONLY preflight for the coupon-reservation apply-time run.
 * Captures the live complete_verified_payment_v1 body (prosrc) via the
 * privileged PostgREST OpenAPI endpoint of the service key and verifies live
 * schema surface. SELECT-only; no mutations, no secrets printed.
 */
import { readFileSync, existsSync } from "node:fs";

let envText = "";
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) envText += readFileSync(f, "utf8") + "\n";
}
const supabaseUrl =
  envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ||
  envText.match(/^SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const serviceKey = envText.match(/^SUPABASE_SECRET_KEY=(.+)$/m)?.[1]?.trim();
if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase env — aborting (no writes attempted).");
  process.exit(1);
}

const rest = async (path, init) => {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init?.headers ?? {}),
    },
  });
  return { status: res.status, json: await res.json().catch(() => null), text: res.statusText };
};

console.log("=== COUPON-RESERVATION PREFLIGHT (read-only) ===");

// 1. Live RPC exposure: if the function is in the service-key OpenAPI, we can
//    capture its identity (args) — prosrc itself is NEVER exposed by PostgREST.
const openapi = await rest("?"); // root OpenAPI document
if (openapi.status === 200 && openapi.json?.definitions) {
  const defs = Object.keys(openapi.json.definitions);
  const fns = Object.keys(openapi.json.paths ?? {}).filter((p) => p.startsWith("rpc/"));
  console.log("REST_RPC_EXPOSED=", fns.join(",") || "(none)");
  console.log(
    "complete_verified_payment_v1_in_openapi=",
    fns.includes("/rpc/complete_verified_payment_v1"),
  );
} else {
  console.log("OPENAPI_STATUS=", openapi.status);
}

// 2. Live schema probes (safe columns only).
const probe = async (table, select) => {
  const r = await rest(`${table}?select=${select}&limit=1`);
  return r.status === 200 ? Object.keys(r.json?.[0] ?? {}) : `status_${r.status}`;
};
console.log("COUPONS_COLUMNS=", await probe("coupons", "*"));
console.log("ORDERS_COLUMNS=", (await probe("orders", "*")).join(","));
console.log("PAYMENT_TX_COLUMNS=", (await probe("payment_transactions", "*")).join(","));
const pf = await probe("payment_financial_completions", "*");
console.log("PAYMENT_FINANCIAL_COMPLETIONS=", Array.isArray(pf) ? pf.join(",") : pf);

// 3. Reservations must NOT exist yet.
const res = await rest("coupon_reservations?select=id&limit=1");
console.log(
  "COUPON_RESERVATIONS_PRE_EXISTING=",
  res.status === 200 ? "YES (UNEXPECTED — STOP)" : `NO (${res.status})`,
);

// 4. Metadata key census: which version marker do live rows actually carry?
const tx = await rest(
  "payment_transactions?select=metadata&limit=200&order=created_at.desc",
);
if (tx.status === 200 && Array.isArray(tx.json)) {
  const census = { v1_marker: 0, other_or_absent: 0 };
  for (const row of tx.json) {
    const v = row.metadata?.financial_finalization_version;
    if (v === 1) census.v1_marker += 1;
    else census.other_or_absent += 1;
  }
  console.log("METADATA_MARKER_CENSUS(last200)=", JSON.stringify(census));
}

console.log("NOTE: live prosrc capture requires a psql/pg session (PostgREST never exposes function bodies).");
console.log("=== PREFLIGHT END (no writes performed) ===");
