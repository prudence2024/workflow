import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// Deterministic fixtures only. Never load local/provider credentials or send network traffic.
const directory = resolve(".vercel/output/functions/__server.func/_ssr");
const files = await readdir(directory);
const checkoutFile = files.find((file) => /^checkout\.server-.*\.mjs$/.test(file));
assert.ok(checkoutFile, "Build the production artifact first");
const checkoutSource = await readFile(resolve(directory, checkoutFile), "utf8");
const contextFile = files.find((file) => /^async-local-storage-.*\.mjs$/.test(file));
const contextSource = await readFile(resolve(directory, contextFile), "utf8");
const contextExport = contextSource.match(/runWithStartContext as (\w+)/)?.[1];
assert.ok(contextExport, "Built Start context export was not found");
process.env.SUPABASE_URL = "https://checkout-fixture.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-only-not-a-credential";
let scenario = "missing-cost";
let calls = [];
const product = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "FIXTURE-MONITOR",
  name: "Controlled checkout fixture",
  price: 50_000,
  status: "active",
  inventory: { quantity: 20, reserved: 0 },
};
globalThis.fetch = async (input, init = {}) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.equal(url.origin, "https://checkout-fixture.invalid", "External network blocked");
  assert.equal(request.method, "GET", "All writes and payment requests blocked");
  calls.push(url);
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
  if (url.pathname === "/rest/v1/products") {
    assert.ok(url.searchParams.get("id").includes(product.id));
    if (scenario === "database-error") return json({ code: "42501", message: "permission denied" }, 403);
    if (scenario === "missing-cost" && url.searchParams.get("select").includes("cost_price")) {
      return json({ code: "42703", message: "column products.cost_price does not exist" }, 400);
    }
    if (scenario === "missing-product") return json([]);
    if (scenario === "inactive") return json([{ ...product, status: "draft" }]);
    if (scenario === "out-of-stock") return json([{ ...product, inventory: { quantity: 0, reserved: 0 } }]);
    return json([{ ...product, ...(scenario === "with-cost" ? { cost_price: 30_000 } : {}) }]);
  }
  if (url.pathname === "/rest/v1/site_settings") return json([
    { key: "delivery_fee", value: "10005" },
    { key: "free_delivery_enabled", value: "false" },
    { key: "free_delivery_threshold", value: "200000" },
  ]);
  throw new Error("Unexpected fixture request: " + url.pathname);
};
const module = await import(pathToFileURL(resolve(directory, checkoutFile)).href);
const context = await import(pathToFileURL(resolve(directory, contextFile)).href);
async function quote(extra = {}) {
  return context[contextExport]({
    contextAfterGlobalMiddlewares: {},
    request: new Request("http://localhost/_serverFn/fixture", { method: "POST" }),
  }, () => module.getCheckoutQuote_createServerFn_handler({
    data: { items: [{ productId: product.id, quantity: 1, ...extra }] }, context: {},
  }));
}
for (scenario of ["missing-cost", "with-cost", "missing-product", "inactive", "out-of-stock", "database-error"]) {
  calls = [];
  const response = await quote();
  if (["missing-cost", "with-cost"].includes(scenario)) {
    assert.equal(response.error, undefined);
    assert.equal(response.result.quote.subtotal, 50_000);
    assert.equal(response.result.quote.delivery_fee, 10_005);
    assert.equal(response.result.quote.total, 60_005);
    assert.equal("cost_price" in response.result.quote.items[0], false);
    assert.equal(calls.filter(u => u.pathname.endsWith("/products")).length, scenario === "missing-cost" ? 2 : 1);
  } else {
    assert.ok(response.error);
    assert.match(response.error.message, scenario === "out-of-stock" ? /enough stock/ : scenario === "database-error" ? /could not be verified/ : /no longer available/);
  }
  console.log("PASS CONTROLLED_ARTIFACT_FIXTURE", scenario);
}
calls = [];
const tampered = await quote({ price: 1, name: "Browser price" });
assert.ok(tampered.error);
assert.equal(calls.length, 0);
console.log("PASS CONTROLLED_ARTIFACT_FIXTURE browser money rejected before DB access");
console.log("ARTIFACT_SHA256=" + createHash("sha256").update(checkoutSource).digest("hex"));
console.log("LIVE_SUPABASE_PROOF=NO; NETWORK_REQUESTS_SENT=0; PAYMENT_CALLS=0");
