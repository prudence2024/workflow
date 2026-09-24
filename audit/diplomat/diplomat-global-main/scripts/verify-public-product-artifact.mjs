import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Execute the built RPC wrappers with deterministic read-only fixtures. No provider traffic.
const dir = resolve(".vercel/output/functions/__server.func/_ssr");
const files = await readdir(dir);
const contextFile = files.find((f) => /^async-local-storage-.*\.mjs$/.test(f));
const contextText = await readFile(resolve(dir, contextFile), "utf8");
const contextExport = contextText.match(/runWithStartContext as (\w+)/)[1];
const context = await import(pathToFileURL(resolve(dir, contextFile)).href);
const names = ["getPublicProducts", "getPublicProductsPaginated", "getPublicProductBySlug", "getRelatedProducts"];
const wrappers = new Map();
for (const file of files.filter((f) => /^server-fns-.*\.mjs$/.test(f))) {
  const source = await readFile(resolve(dir, file), "utf8");
  if (!source.includes("getPublicProducts_createServerFn_handler")) continue;
  const module = await import(pathToFileURL(resolve(dir, file)).href);
  for (const name of names) if (module[name + "_createServerFn_handler"]) wrappers.set(name, module[name + "_createServerFn_handler"]);
}
assert.equal(wrappers.size, names.length, "All built public RPC wrappers must be found");
process.env.SUPABASE_URL = "https://public-product-fixture.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-only-not-a-secret";
const row = { id: "B", slug: "b", name: "Current fixture B", status: "active", price: 85000,
  product_images: [{ secure_url: "second.jpg", sort_order: 1 }, { secure_url: "first.jpg", sort_order: 0 }], inventory: { quantity: 10, low_stock_threshold: 3 } };
let scenario = "empty";
let requests = 0;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.equal(url.origin, "https://public-product-fixture.invalid", "External traffic blocked");
  assert.equal(request.method, "GET", "Writes blocked");
  if (url.pathname === "/rest/v1/site_settings") return new Response(JSON.stringify([{ key: "low_stock_threshold_default", value: "5" }]), { headers: { "content-type": "application/json" } });
  assert.equal(url.pathname, "/rest/v1/products");
  assert.equal(url.searchParams.get("status"), "eq.active");
  requests++;
  if (scenario === "error") return new Response(JSON.stringify({ code: "08006", message: "fixture failure" }), { status: 500, headers: { "content-type": "application/json" } });
  if (url.searchParams.has("slug")) assert.equal(url.searchParams.get("slug"), "eq.b");
  if (url.searchParams.has("id")) assert.equal(url.searchParams.get("id"), "neq.A");
  return new Response(JSON.stringify(scenario === "active" ? [row] : []), { headers: { "content-type": "application/json", "content-range": scenario === "active" ? "0-0/1" : "*/0" } });
};
for (scenario of ["empty", "error", "active"]) {
  for (const name of names) {
    const response = await context[contextExport]({ request: new Request("http://localhost/_serverFn/fixture"), contextAfterGlobalMiddlewares: {} }, () => wrappers.get(name)({
      data: name === "getPublicProductBySlug" ? { slug: "b" } : name === "getRelatedProducts" ? { excludeId: "A", limit: 4 } : name === "getPublicProductsPaginated" ? { page: 1, pageSize: 5, categories: [], q: "", sort: "newest" } : undefined,
      context: {},
    }));
    if (scenario === "error") assert.match(response.error?.message || "", /temporarily unavailable/);
    else {
      assert.equal(response.error, undefined);
      const products = name === "getPublicProductBySlug" ? (response.result.product ? [response.result.product] : []) : response.result.products;
      assert.equal(products.length, scenario === "active" ? 1 : 0);
      if (scenario === "active") {
        assert.deepEqual(products[0].images, ["first.jpg", "second.jpg"]);
        assert.equal(products[0].stockQuantity, 10);
        assert.equal(products[0].stockState, "in_stock");
      }
    }
    console.log("PASS CONTROLLED_ARTIFACT_RPC", name, scenario);
  }
}
assert.equal(requests, 12);
console.log("EXACT_ARTIFACT_PUBLIC_PRODUCTS=PASS; NETWORK_REQUESTS_SENT=0; WRITES=0");
