// TEMPORARY verification probe (docs/evidence only). GET-only PostgREST reads
// plus ONE provably side-effect-free RPC call (the frozen-reference guard is
// the FIRST statement of complete_verified_payment_v1 and only RAISEs — it can
// never reach any DML). Prints operational identifiers only: never secret
// values, never customer PII.
import { readFileSync } from "node:fs";

function envFromFile(name) {
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^${name}=(.*)$`));
      if (m) return m[1].trim();
    }
  } catch {
    // fall through
  }
  return undefined;
}

const URL0 = process.env.SUPABASE_URL ?? envFromFile("VITE_SUPABASE_URL") ?? "";
const KEY = process.env.SUPABASE_SECRET_KEY ?? envFromFile("SUPABASE_SECRET_KEY") ?? "";
if (!URL0 || !KEY) {
  console.error("missing env");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const FROZEN_GUARD_BODY = JSON.stringify({
  p_transaction_id: "00000000-0000-0000-0000-000000000000",
  p_reference: "DG-MTLML9QG-WWA7",
  p_amount_kobo: 0,
  p_currency: "NGN",
  p_verified_at: new Date().toISOString(),
});

async function get(path) {
  const res = await fetch(`${URL0}/rest/v1/${path}`, { headers: H });
  if (!res.ok) {
    console.log(`HTTP ${res.status} for ${path}`);
    console.log((await res.text()).slice(0, 400));
    return null;
  }
  return res.json();
}

// ---- Ledger / business-data drift check (the pre-gate for readiness) ----
const ledger = await get("payment_financial_completions?select=order_id,reference");
console.log("== payment_financial_completions ==", JSON.stringify(ledger));
const tx = await get(
  "payment_transactions?select=id,reference,status,created_at&order=created_at.desc&limit=5",
);
console.log("== newest payment_transactions ==", JSON.stringify(tx));
const orders = await get("orders?select=id,reference,status&order=created_at.desc&limit=5");
console.log("== newest orders ==", JSON.stringify(orders));

// ---- RPC privilege differential (guard call is provably side-effect-free) ----
const rpcRes = await fetch(`${URL0}/rest/v1/rpc/complete_verified_payment_v1`, {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: FROZEN_GUARD_BODY,
});
console.log("== frozen-guard RPC call (service key) ==");
console.log("status:", rpcRes.status);
console.log("body:", (await rpcRes.text()).slice(0, 300));

const ANON = envFromFile("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
if (ANON) {
  const anonRpc = await fetch(`${URL0}/rest/v1/rpc/complete_verified_payment_v1`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: FROZEN_GUARD_BODY,
  });
  console.log("== frozen-guard RPC call (anon key) ==");
  console.log("status:", anonRpc.status);
  console.log("body:", (await anonRpc.text()).slice(0, 200));
}

// ---- Ledger must STILL be empty after every probe ----
const ledger2 = await get("payment_financial_completions?select=order_id,reference");
console.log("== ledger after all probes ==", JSON.stringify(ledger2));
