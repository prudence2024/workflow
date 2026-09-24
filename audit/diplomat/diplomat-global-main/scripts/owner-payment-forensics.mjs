// STRICTLY GET-ONLY forensic snapshot of the Owner's real test payment state.
// No RPC calls, no writes of any kind — financial reconciliation is complete and
// any replay must go through the application path, never this script.
// Prints operational identifiers only (references, ids, statuses, counts).
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

async function get(path, label) {
  const res = await fetch(`${URL0}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    console.log(`HTTP ${res.status} for ${label ?? path}`);
    return null;
  }
  return res.json();
}

const SUCCESS_REFS = ["DG-MTXQPF75-E0C6898B", "DG-MTXQV3D3-6C470060"];

const ledgerAll = await get(
  `payment_financial_completions?select=order_id,reference,completed_at&reference=in.(${SUCCESS_REFS.join(",")})`,
  "ledger",
);
const ledgerByRef = new Map((ledgerAll ?? []).map((r) => [r.reference, r]));

for (const REF of SUCCESS_REFS) {
  const tx = await get(
    `payment_transactions?select=id,order_id,status,amount,currency,created_at,paid_at&reference=eq.${REF}`,
    `tx ${REF}`,
  );
  const t = tx?.[0];
  if (!t) {
    console.log(`\n== ${REF} == NO TRANSACTION ROW`);
    continue;
  }
  const order = await get(
    `orders?select=id,reference,status,payment_reference&order_id=eq.${t.order_id}`.replace(
      "order_id=eq.",
      "id=eq.",
    ),
    `order ${REF}`,
  );
  const o = order?.[0] ?? null;
  const items = await get(`order_items?select=product_id,quantity&order_id=eq.${t.order_id}`, `items ${REF}`);
  const pids = (items ?? []).map((i) => i.product_id).filter(Boolean);
  const inv = pids.length
    ? await get(`inventory?select=product_id,quantity&product_id=in.(${pids.join(",")})`, `inv ${REF}`)
    : [];
  const receipts = await get(`receipts?select=id&order_id=eq.${t.order_id}`, `receipts ${REF}`);
  const lg = ledgerByRef.get(REF);
  console.log(`\n== ${REF} ==`);
  console.log(`  tx_id=${t.id} tx_status=${t.status} amount=${t.amount} ${t.currency}`);
  console.log(`  order_id=${t.order_id}`);
  console.log(
    `  order_status=${o?.status ?? "?"} order_ref=${o?.reference ?? "?"} payment_reference=${o?.payment_reference ?? "-"}`,
  );
  console.log(
    `  ledger_rows=${lg ? 1 : 0} completed_at=${lg?.completed_at ?? "-"} receipts=${receipts?.length ?? "ERR"}`,
  );
  for (const i of inv ?? []) console.log(`  inventory product=${i.product_id.slice(0, 8)}… qty=${i.quantity}`);
}

// Whole-ledger and receipt totals for the order(s) involved
const orderIds = new Set();
for (const REF of SUCCESS_REFS) {
  const tx = await get(`payment_transactions?select=order_id&reference=eq.${REF}`, `oid ${REF}`);
  if (tx?.[0]) orderIds.add(tx[0].order_id);
}
if (orderIds.size) {
  const ids = [...orderIds].join(",");
  const ledger = await get(`payment_financial_completions?select=reference&order_id=in.(${ids})`, "ledger-by-order");
  console.log(`\n== ORDER-SCOPED TOTALS ==`);
  console.log(`  distinct_orders=${orderIds.size} ledger_rows_for_orders=${ledger?.length ?? "ERR"}`);
  for (const oid of orderIds) {
    const r = await get(`receipts?select=id&order_id=eq.${oid}`, `receipts-order ${oid}`);
    console.log(`  order=${oid} receipts=${r?.length ?? "ERR"}`);
  }
}
console.log("\nGET-ONLY: no mutations performed.");
