import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { loadEnv } from "vite";

const root = process.cwd();
const runtimeEnv = loadEnv("production", root, "");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function getOpenPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  invariant(address && typeof address === "object", "Unable to allocate a preview port");
  const { port } = address;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function fetchWithTimeout(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
}

async function waitForPreview(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Preview exited before becoming ready.\n${logs()}`);
    }
    try {
      const response = await fetchWithTimeout(`${baseUrl}/`, { redirect: "manual" });
      if (response.status > 0) return response;
    } catch {
      // The server may still be binding or loading its first SSR module.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Preview did not become ready.\n${logs()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const port = await getOpenPort();
const baseUrl = `http://127.0.0.1:${port}`;
const args = [
  resolve(root, "node_modules/srvx/bin/srvx.mjs"),
  "serve",
  "--prod",
  "--host=127.0.0.1",
  `--port=${port}`,
  "--dir=.",
  "--static=.vercel/output/static",
  "--entry=.vercel/output/functions/__server.func/index.mjs",
];
const childEnv = {
  ...runtimeEnv,
  ...process.env,
  NODE_ENV: "production",
  // A non-secret test-only key lets the webhook exercise HMAC rejection in CI.
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "sk_test_preview_smoke_only",
};

// CI runs this smoke test with no Supabase credentials, so DB-backed content
// (Footer contact settings, social links, categories) cannot exist there.
// Mirror the application's own check (src/lib/database.server.ts: a URL plus the
// server-only secret key) so data-dependent assertions are replaced by
// assertions on the shipped degraded state instead of silently skipped.
const serverDbConfigured = Boolean(
  (childEnv.SUPABASE_URL?.trim() || childEnv.VITE_SUPABASE_URL?.trim()) &&
    childEnv.SUPABASE_SECRET_KEY?.trim(),
);

const child = spawn(process.execPath, args, {
  cwd: root,
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
const logs = () => `${stdout}\n${stderr}`.trim();

try {
  const home = await waitForPreview(baseUrl, child, logs);
  invariant(home.status === 200, `Expected / to return 200, received ${home.status}`);
  const homeHtml = await home.text();
  invariant(homeHtml.includes("<!DOCTYPE html>"), "Homepage did not return an HTML document");
  const footerStart = homeHtml.indexOf("<footer");
  invariant(footerStart >= 0, "The public Footer was not rendered");
  const footerMarkup = homeHtml.slice(footerStart);
  const footerSections = [...footerMarkup.matchAll(/data-footer-section="([^"]+)"/g)].map(
    (match) => match[1],
  );
  invariant(
    JSON.stringify(footerSections) ===
      JSON.stringify(["brand", "quick-links", "company", "contact"]),
    `The public Footer section order was ${footerSections.join(", ") || "empty"}`,
  );
  for (const label of [
    "Products / Shop",
    "Contact Us",
    "Leave a Review",
    "Warranty &amp; Returns",
    "FAQ",
    "Blog",
    "About Us",
    "Privacy Policy",
    "Terms &amp; Conditions",
  ]) {
    invariant(footerMarkup.includes(label), `The public Footer is missing ${label}`);
  }
  const contactSections = [...footerMarkup.matchAll(/data-footer-contact="([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (serverDbConfigured) {
    invariant(
      JSON.stringify(contactSections) === JSON.stringify(["address", "email", "phone", "whatsapp"]),
      `The Footer contact order was ${contactSections.join(", ") || "empty"}`,
    );
  } else {
    // No database in this environment: the contact rows are DB-backed, so assert
    // the shipped fallback instead of demanding live data that cannot exist.
    invariant(
      contactSections.length === 0,
      `The Footer rendered DB contact rows without a database connection: ${contactSections.join(", ")}`,
    );
    invariant(
      footerMarkup.includes("Contact details not configured."),
      "The Footer did not render its documented no-database contact fallback",
    );
    console.log(
      "Footer contact rows: asserted the no-database fallback (SUPABASE_URL/VITE_SUPABASE_URL + SUPABASE_SECRET_KEY are unset here).",
    );
  }
  invariant(
    !footerMarkup.includes("/shop?category="),
    "The Footer still contains category links rejected by the Owner",
  );
  invariant(
    !footerMarkup.includes("Help &amp; Support"),
    "The Footer still contains the rejected Help & Support section",
  );

  if (process.env.VERIFY_LIVE_FOOTER === "1") {
    const renderedSocialCount = footerMarkup.match(/data-footer-social-link=/g)?.length ?? 0;
    invariant(
      footerMarkup.includes('data-footer-social-source="social-links"'),
      "No active DB social links rendered in the Footer",
    );
    invariant(renderedSocialCount > 0, "No active DB social link icons rendered in the Footer");
    invariant(
      !footerMarkup.includes("Not configured"),
      "An authoritative Footer contact setting is missing",
    );
    invariant(footerMarkup.includes('href="mailto:'), "Footer email is not a usable mail link");
    invariant(footerMarkup.includes('href="tel:'), "Footer phone is not a usable phone link");
    console.log(`Verified live Footer settings and ${renderedSocialCount} active social links`);
  }

  if (process.env.VERIFY_LIVE_CATEGORIES === "1") {
    const homeCategoryStart = homeHtml.indexOf("data-home-categories");
    invariant(homeCategoryStart >= 0, "Homepage category section was not rendered");
    invariant(footerStart > homeCategoryStart, "Footer was not rendered after Homepage content");
    const homeCategoryMarkup = homeHtml.slice(homeCategoryStart, footerStart);
    const categorySlugs = [
      ...new Set(
        [...homeCategoryMarkup.matchAll(/href="\/shop\?category=([^"&]+)"/g)].map((match) =>
          decodeURIComponent(match[1]),
        ),
      ),
    ];
    invariant(categorySlugs.length > 0, "Homepage did not expose any active DB category links");

    const selectedSlug = categorySlugs[0];
    const selectedShop = await fetchWithTimeout(
      `${baseUrl}/shop?category=${encodeURIComponent(selectedSlug)}`,
      { redirect: "follow" },
    );
    invariant(
      selectedShop.status === 200,
      `Expected selected Shop category to return 200, received ${selectedShop.status}`,
    );
    invariant(
      new URL(selectedShop.url).searchParams.get("category") === selectedSlug,
      "Shop canonical redirect did not preserve the requested category",
    );
    const selectedShopHtml = await selectedShop.text();
    invariant(
      selectedShopHtml.match(/data-category-selector="shop"/g)?.length === 1,
      "Shop did not render exactly one category selector",
    );
    invariant(
      selectedShopHtml.match(/data-selected="true"/g)?.length === 1,
      "Shop did not select exactly the category requested by URL",
    );
    invariant(
      !selectedShopHtml.includes("Product categories could not be loaded"),
      "Shop rendered the category database error state",
    );
    console.log(`Verified live category selection: ${selectedSlug}`);
  }

  const inventoryProductSlug = process.env.VERIFY_INVENTORY_PRODUCT_SLUG?.trim();
  if (inventoryProductSlug) {
    const expectedAvailability = process.env.VERIFY_INVENTORY_EXPECTED;
    invariant(
      expectedAvailability === "in-stock" || expectedAvailability === "sold-out",
      "VERIFY_INVENTORY_EXPECTED must be in-stock or sold-out",
    );
    const productResponse = await fetchWithTimeout(
      `${baseUrl}/products/${encodeURIComponent(inventoryProductSlug)}`,
      { redirect: "follow" },
    );
    invariant(
      productResponse.status === 200,
      `Expected inventory product to return 200, received ${productResponse.status}`,
    );
    const productHtml = await productResponse.text();
    const expectedLabel = expectedAvailability === "in-stock" ? "In stock" : "Sold out";
    invariant(
      productHtml.includes(`>${expectedLabel}</span>`),
      `Product ${inventoryProductSlug} did not render ${expectedLabel}`,
    );
    console.log(`Verified live inventory availability: ${inventoryProductSlug}=${expectedLabel}`);
  }

  for (const path of ["/contact"]) {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, { redirect: "manual" });
    invariant(
      response.status === 200,
      `Expected ${path} to return 200, received ${response.status}`,
    );
  }

  for (const path of ["/shop", "/blog"]) {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, { redirect: "manual" });
    invariant(
      [301, 302, 307, 308].includes(response.status),
      `Expected ${path} to canonicalize with a redirect, received ${response.status}`,
    );
  }

  const dashboard = await fetchWithTimeout(`${baseUrl}/dashboard`, { redirect: "manual" });
  invariant(
    [301, 302, 307, 308].includes(dashboard.status),
    `Expected unauthenticated /dashboard to redirect, received ${dashboard.status}`,
  );
  invariant(
    dashboard.headers.get("location")?.startsWith("/admin/"),
    `Unexpected dashboard redirect: ${dashboard.headers.get("location")}`,
  );

  const webhook = await fetchWithTimeout(`${baseUrl}/api/webhook/paystack`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": "forged-preview-smoke-signature",
    },
    body: JSON.stringify({
      event: "charge.success",
      data: { reference: "forged-preview-smoke-reference" },
    }),
    redirect: "manual",
  });
  invariant(
    webhook.status === 400,
    `Expected forged webhook to return 400, received ${webhook.status}`,
  );
  const webhookBody = await webhook.json();
  invariant(
    webhookBody.error === "Invalid signature",
    "Forged webhook returned an unexpected body",
  );

  for (const path of [
    "/order-success?reference=forged-preview-smoke-reference",
    "/order-success?token=forged-preview-smoke-token",
    "/checkout/callback?reference=forged-preview-smoke-reference&trxref=forged-preview-smoke-reference",
  ]) {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, { redirect: "manual" });
    invariant(
      response.status === 200,
      `Expected ${path} to return 200, received ${response.status}`,
    );
    const html = await response.text();
    invariant(
      !html.includes(">Payment Successful</h1>"),
      `${path} claimed payment success without a finalized application payment`,
    );
  }

  const invalidReceipt = await fetchWithTimeout(`${baseUrl}/api/receipt/not-an-opaque-token`, {
    redirect: "manual",
  });
  invariant(
    invalidReceipt.status === 400,
    `Expected malformed receipt token to return 400, received ${invalidReceipt.status}`,
  );
  const guessedReceipt = await fetchWithTimeout(
    `${baseUrl}/api/receipt/99999999-9999-4999-8999-999999999999`,
    { redirect: "manual" },
  );
  // Without a database the lookup throws and the route answers fail-closed with
  // 503 (src/lib/receipt-public.server.ts: "Receipt is temporarily unavailable").
  // Both 404 and 503 are denials; the invariant that matters is that no receipt
  // content is exposed, asserted immediately below.
  invariant(
    serverDbConfigured
      ? guessedReceipt.status === 404
      : [404, 503].includes(guessedReceipt.status),
    `Expected guessed receipt token to return ${serverDbConfigured ? 404 : "404 or 503"}, received ${guessedReceipt.status}`,
  );
  invariant(
    !(await guessedReceipt.text()).includes("PAYMENT RECEIPT"),
    "A guessed receipt token exposed a payment receipt",
  );

  const assetPath = homeHtml.match(/(?:src|href)="(\/assets\/[^"?#]+)/)?.[1];
  invariant(assetPath, "Homepage did not reference a built asset");
  const asset = await fetchWithTimeout(`${baseUrl}${assetPath}`, { redirect: "manual" });
  invariant(asset.status === 200, `Expected ${assetPath} to return 200, received ${asset.status}`);

  console.log(`Preview smoke passed at ${baseUrl}`);
  console.log(
    "Verified: public routes, protected Admin redirect, forged Paystack webhook, direct payment URLs, opaque receipt denial, built asset",
  );
} catch (error) {
  const previewLogs = logs();
  if (previewLogs) console.error(previewLogs);
  throw error;
} finally {
  await stopChild(child);
}
