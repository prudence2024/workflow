import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// Deterministic fixtures only. Never load local/provider credentials or send network traffic.
const directory = resolve(".vercel/output/functions/__server.func/_ssr");
const files = await readdir(directory);
const successFile = files.find((file) => /^payment-success\.server-.*\.mjs$/.test(file));
assert.ok(successFile, "Build the production artifact first");
const successSource = await readFile(resolve(directory, successFile), "utf8");
const contextFile = files.find((file) => /^async-local-storage-.*\.mjs$/.test(file));
const contextSource = await readFile(resolve(directory, contextFile), "utf8");
const contextExport = contextSource.match(/runWithStartContext as (\w+)/)?.[1];
assert.ok(contextExport, "Built Start context export was not found");
process.env.SUPABASE_URL = "https://success-fixture.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-only-not-a-credential";
let scenario = "ready";
let calls = [];
const reference = "DG-AUDIT-12345678";
const token = "44444444-4444-4444-8444-444444444444";
const quote = {
  version: 2,
  currency: "NGN",
  subtotal: 85000,
  discount: 0,
  delivery_fee: 10000,
  total: 95000,
  coupon_id: null,
  items: [
    { product_id: "11111111-1111-4111-8111-111111111111", sku: "FIX", name: "Fixture", quantity: 1, unit_price: 85000, line_total: 85000 },
  ],
};
const order = {
  id: "22222222-2222-2222-8222-222222222222",
  reference,
  status: "paid",
  payment_reference: reference,
  subtotal: 85000,
  discount: 0,
  delivery_fee: 10000,
  total: 95000,
  currency: "NGN",
  coupon_id: null,
  order_items: quote.items.map(({ cost_price: _c, ...item }) => item),
};
const transaction = {
  id: "33333333-3333-3333-8333-333333333333",
  reference,
  order_id: order.id,
  amount: 95000,
  currency: "NGN",
  status: "successful",
  metadata: { quote_version: 2, order_id: order.id, order_reference: reference, quote },
};
globalThis.fetch = async (input, init = {}) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.equal(url.origin, "https://success-fixture.invalid", "External network blocked");
  assert.equal(request.method, "GET", "All writes and payment requests blocked");
  calls.push(url);
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
  if (url.pathname === "/rest/v1/payment_transactions") {
    if (scenario === "missing") return json([]);
    return json([transaction]);
  }
  if (url.pathname === "/rest/v1/orders") {
    if (scenario === "unpaid") return json([{ ...order, status: "pending" }]);
    if (scenario === "tampered") return json([{ ...order, total: 1 }]);
    return json([order]);
  }
  if (url.pathname === "/rest/v1/receipts") {
    if (scenario === "error") return json({ code: "42501", message: "permission denied" }, 403);
    if (scenario === "pending") return json([]);
    if (url.searchParams.get("download_token")) return json([{ transaction_id: transaction.id }]);
    return json([{ order_id: order.id, transaction_id: transaction.id, download_token: token }]);
  }
  throw new Error("Unexpected fixture request: " + url.pathname);
};
const module = await import(pathToFileURL(resolve(directory, successFile)).href);
const context = await import(pathToFileURL(resolve(directory, contextFile)).href);
async function lookup(data) {
  return context[contextExport]({
    contextAfterGlobalMiddlewares: {},
    request: new Request("http://localhost/_serverFn/fixture", { method: "POST" }),
  }, () => module.getPaymentSuccessDetails_createServerFn_handler({ data, context: {} }));
}
for (scenario of ["ready", "pending", "error"]) {
  calls = [];
  const response = await lookup({ reference });
  assert.equal(response.error, undefined);
  assert.equal(response.result.ok, true);
  assert.equal(response.result.payment_confirmed, true);
  assert.equal(response.result.receiptState, scenario);
  assert.equal(calls.length, 3, "receipt lookup reads exactly three tables");
  console.log("PASS CONTROLLED_ARTIFACT_FIXTURE paid receipt " + scenario);
}
scenario = "ready";
calls = [];
const refresh = await lookup({ receiptToken: token });
assert.equal(refresh.result.ok, true);
assert.equal(refresh.result.payment_confirmed, true);
console.log("PASS CONTROLLED_ARTIFACT_FIXTURE paid refresh via opaque token");
for (scenario of ["missing", "unpaid", "tampered"]) {
  const response = await lookup({ reference });
  assert.equal(response.result.ok, false, scenario + " must never confirm payment");
  console.log("PASS CONTROLLED_ARTIFACT_FIXTURE no false success: " + scenario);
}
console.log("ARTIFACT_SHA256=" + createHash("sha256").update(successSource).digest("hex"));
console.log("LIVE_SUPABASE_PROOF=NO; NETWORK_REQUESTS_SENT=0; PAYMENT_CALLS=0; WRITE_REQUESTS=0");
