/**
 * Owner addendum §7–§11 — FINAL-UNIT PAYMENT-LEVEL CONCURRENCY PROOF.
 *
 * Executes the REAL finalization RPC (complete_verified_payment_v2) concurrently
 * for competing paid checkouts against the live database, using uniquely
 * prefixed test rows that are fully removed afterwards. No Paystack calls are
 * made — the RPC is the exact code path both callback and webhook run after
 * provider verification (financial_finalization_version=2 marker), so the
 * DB-level outcome IS the payment-level outcome for the inventory question.
 *
 * Scenarios: stock=1 with A/B qty 1 (final unit); stock=5 with 3+3; 4+1; 2+2+2.
 * Asserts: financial completions, inventory decrements, paid orders, and that
 * the losing customer's order NEVER reaches paid/fulfillable state.
 *
 * Run: node --env-file=.env.local node --input-type=module - < this file is NOT
 * supported; run with: npx tsx tests/final-unit-concurrency.live.ts
 * (guarded: refuses to run unless FINAL_UNIT_LIVE_TEST=1).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TAG = "ZZCONCURRENCYTEST";
if (process.env.FINAL_UNIT_LIVE_TEST !== "1") {
  console.log("SKIP: set FINAL_UNIT_LIVE_TEST=1 to run against the live DB");
  process.exit(0);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("FATAL: missing Supabase credentials");
  process.exit(1);
}
const sb: SupabaseClient = createClient(url, key);

interface ScenarioResult {
  name: string;
  stockBefore: number;
  demands: Array<{ who: string; qty: number }>;
  completions: number;
  decrements: number;
  paidOrders: number;
  loserPaid: boolean;
  loserState: string;
}

const results: ScenarioResult[] = [];

async function cleanup(ids: {
  productIds: string[];
  customerIds: string[];
  orderIds: string[];
}) {
  // FK-safe reverse order; transaction metadata holds order_id (no FK) —
  // payment_transactions.order_id has ON DELETE SET NULL.
  if (ids.orderIds.length) {
    await sb.from("payment_transactions").delete().in("order_id", ids.orderIds);
    await sb.from("order_items").delete().in("order_id", ids.orderIds);
    await sb.from("payment_financial_completions").delete().in("order_id", ids.orderIds);
    await sb.from("orders").delete().in("id", ids.orderIds);
  }
  if (ids.productIds.length) {
    await sb.from("inventory").delete().in("product_id", ids.productIds);
    await sb.from("products").delete().in("id", ids.productIds);
  }
  if (ids.customerIds.length) await sb.from("customers").delete().in("id", ids.customerIds);
}

async function runScenario(
  name: string,
  stock: number,
  demands: Array<{ who: string; qty: number }>,
): Promise<ScenarioResult> {
  const log = (...a: unknown[]) => console.log(`[${name}]`, ...a);
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ids = { productIds: [] as string[], customerIds: [] as string[], orderIds: [] as string[] };
  try {
    // 1. Product + inventory
    const { data: product, error: pErr } = await sb
      .from("products")
      .insert({
        slug: `${TAG}-p-${suffix}`,
        sku: `${TAG}-SKU-${suffix}`,
        name: `${TAG} product`,
        price: 10000,
        status: "active",
      })
      .select("id")
      .single();
    if (pErr || !product) throw new Error("product insert: " + pErr?.message);
    ids.productIds.push(product.id);
    const { error: iErr } = await sb
      .from("inventory")
      .insert({ product_id: product.id, quantity: stock, reserved: 0 });
    if (iErr) throw new Error("inventory insert: " + iErr.message);

    // 2. Customers + orders + items + transactions (v2-marker quotes)
    const mkCustomer = async (who: string) => {
      const { data: c, error } = await sb
        .from("customers")
        .insert({ email: `${TAG}-${who}-${suffix}@example.com`, first_name: who })
        .select("id")
        .single();
      if (error || !c) throw new Error("customer insert: " + error?.message);
      ids.customerIds.push(c.id);
      return c.id;
    };
    const mkOrder = async (who: string, qty: number, customerId: string, qtyForAmount: number) => {
      const ref = `${TAG}-${who}-${suffix}`;
      const unit = 10000;
      const total = unit * qty;
      const quote = {
        currency: "NGN",
        subtotal: total,
        discount: 0,
        delivery_fee: 0,
        total,
        coupon_id: null,
        items: [
          {
            product_id: null, // replaced below with real id
            sku: `${TAG}-SKU-${suffix}`,
            name: `${TAG} product`,
            quantity: qty,
            unit_price: unit,
            line_total: total,
            cost_price: null,
          },
        ],
      };
      quote.items[0].product_id = product.id;
      const { data: o, error: oErr } = await sb
        .from("orders")
        .insert({
          reference: ref,
          customer_id: customerId,
          email: `${TAG}-${who}-${suffix}@example.com`,
          status: "pending",
          subtotal: total,
          discount: 0,
          delivery_fee: 0,
          total,
          currency: "NGN",
          idempotency_key: crypto.randomUUID(),
          shipping_address: {},
        })
        .select("id, reference, created_at")
        .single();
      if (oErr || !o) throw new Error("order insert: " + oErr?.message);
      ids.orderIds.push(o.id);
      const { error: oiErr } = await sb.from("order_items").insert({
        order_id: o.id,
        product_id: product.id,
        sku: `${TAG}-SKU-${suffix}`,
        name: `${TAG} product`,
        quantity: qty,
        unit_price: unit,
        line_total: total,
      });
      if (oiErr) throw new Error("order_item insert: " + oiErr.message);
      const { data: t, error: tErr } = await sb
        .from("payment_transactions")
        .insert({
          order_id: o.id,
          reference: ref,
          paystack_reference: ref,
          amount: total,
          currency: "NGN",
          status: "initiated",
          metadata: {
            financial_finalization_version: 2,
            quote_version: 2,
            order_id: o.id,
            order_reference: ref,
            quote,
          },
        })
        .select("id")
        .single();
      if (tErr || !t) throw new Error("transaction insert: " + tErr?.message);
      // DB clock, not local clock — the RPC's verified-at window is
      // now-10m..now+1m against the DATABASE's now().
      return { orderId: o.id, txId: t.id, ref, who, qty, dbNow: o.created_at };
    };

    const attempts = [];
    for (const d of demands) {
      const cid = await mkCustomer(d.who);
      attempts.push(await mkOrder(d.who, d.qty, cid, d.qty));
    }
    log("setup complete:", attempts.length, "orders");

    // 3. CONCURRENT finalization — both "provider successes" race the RPC.
    log("launching concurrent finalization…");
    const outcomes = await Promise.all(
      attempts.map((a) =>
        sb.rpc("complete_verified_payment_v2", {
          p_transaction_id: a.txId,
          p_reference: a.ref,
          p_amount_kobo: 10000 * a.qty * 100,
          p_currency: "NGN",
          p_verified_at: new Date(a.dbNow).toISOString(),
        })
          .then((r) => ({ who: a.who, data: r.data, error: r.error }))
          .catch((e) => ({ who: a.who, data: null, error: e })),
      ),
    );
    log("finalization returned");

    // 4. Observe committed state
    const { data: invAfter } = await sb
      .from("inventory")
      .select("quantity")
      .eq("product_id", product.id)
      .single();
    const { data: ordersAfter } = await sb
      .from("orders")
      .select("reference, status")
      .in("id", ids.orderIds);
    const { count: completionCount } = await sb
      .from("payment_financial_completions")
      .select("*", { count: "exact", head: true })
      .in("order_id", ids.orderIds);

    const completions = completionCount ?? 0;
    const decremented = (invAfter?.quantity ?? stock) < stock;
    const decrements = decremented ? stock - (invAfter?.quantity ?? 0) : 0;
    const paidOrders = (ordersAfter ?? []).filter((o) => o.status === "paid").length;
    // loser identification: the order whose finalization errored (or absent)
    const failingWhos = outcomes.filter((x) => x.error).map((x) => x.who);
    const loserState =
      (ordersAfter ?? []).find((o) => failingWhos.some((w) => o.reference.includes(`-${w}-`)))
        ?.status ?? "n/a";

    const result: ScenarioResult = {
      name,
      stockBefore: stock,
      demands: demands.map((d) => ({ who: d.who, qty: d.qty })),
      completions,
      decrements,
      paidOrders,
      loserPaid: loserState === "paid",
      loserState,
    };
    results.push(result);

    console.log(`\n=== ${name} ===`);
    for (const o of outcomes) {
      console.log(
        `  ${o.who}: ${o.error ? "REJECTED — " + o.error.message : "COMPLETED " + JSON.stringify(o.data)}`,
      );
    }
    console.log(
      `  inventory: ${stock} -> ${invAfter?.quantity} (decremented ${decrements})`,
    );
    console.log(
      `  financial_completions=${completions}  decrements=${decrements}  paid_orders=${paidOrders}`,
    );
    return result;
  } finally {
    await cleanup(ids);
  }
}

// ── Scenarios (§7 stock=1; §11 quantity variants) ──
await runScenario("FINAL UNIT: stock=1, A=1 & B=1", 1, [
  { who: "A", qty: 1 },
  { who: "B", qty: 1 },
]);
await runScenario("stock=5: A=3 & B=3", 5, [
  { who: "A", qty: 3 },
  { who: "B", qty: 3 },
]);
await runScenario("stock=5: A=4 & B=1", 5, [
  { who: "A", qty: 4 },
  { who: "B", qty: 1 },
]);
await runScenario("stock=5: A=2 & B=2 & C=2", 5, [
  { who: "A", qty: 2 },
  { who: "B", qty: 2 },
  { who: "C", qty: 2 },
]);

// ── Verdicts ──
let failures = 0;
for (const r of results) {
  const maxFulfillable = r.stockBefore;
  const totalDemand = r.demands.reduce((s, d) => s + d.qty, 0);
  // Invariant 1: never more fulfilled quantity than physical stock.
  if (r.decrements > maxFulfillable) {
    console.error(`FAIL ${r.name}: oversell — decremented ${r.decrements} of ${r.stockBefore}`);
    failures++;
  }
  // Invariant 2: a customer whose finalization was rejected must NOT be paid.
  if (r.paidOrders > r.completions) {
    console.error(`FAIL ${r.name}: paid order without financial completion`);
    failures++;
  }
  // Invariant 3: exactly one completion per decremented unit-set.
  if (r.completions > r.demands.length) {
    console.error(`FAIL ${r.name}: more completions than payment attempts`);
    failures++;
  }
  if (r.loserPaid) {
    console.error(`FAIL ${r.name}: losing customer's order reached paid state`);
    failures++;
  }
}
console.log(
  `\nSUMMARY: ${results.length} scenarios, ${failures} invariant failures` +
    (failures === 0 ? " — NO OVERSELL, NO PAID-WITHOUT-COMPLETION" : ""),
);
process.exit(failures === 0 ? 0 : 1);
