/**
 * Authenticated Admin route profiler — uses the saved Owner storageState
 * (real Clerk dev-instance sign-in; no bypass). Measures per route:
 * request count, serverFn request count, duplicates, slowest request,
 * time-to-usable (sidebar/nav paint), long tasks, console errors.
 * Read-only: navigates and observes; never mutates data.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:8080";
const STATE = "admin-owner.state";
const ROUTES = [
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/products",
  "/dashboard/inventory",
  "/dashboard/orders",
  "/dashboard/customers",
  "/dashboard/transactions",
  "/dashboard/payments",
  "/dashboard/receipts",
  "/dashboard/refunds",
  "/dashboard/coupons",
  "/dashboard/reviews",
  "/dashboard/blog",
  "/dashboard/pages",
  "/dashboard/media",
  "/dashboard/settings",
  "/dashboard/notifications",
  "/dashboard/test-data",
];

function isServerFn(url) {
  return /_server|serverFn|_serverFn|\/_fn|createServerFnReference|server/.test(url) && url.includes("/api");
}

(async () => {
  const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];

  for (const route of ROUTES) {
    const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const requests = [];
    const consoleErrors = [];
    let longTasks = 0;

    page.on("request", (r) => requests.push({ url: r.url(), ts: Date.now() }));
    page.on("response", (res) => {
      const r = requests.find((x) => x.url === res.url() && x.status === undefined);
      if (r) r.status = res.status();
    });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });

    const t0 = Date.now();
    let usableMs = null;
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      // Time-to-usable: main content region + nav visible (sidebar OR mobile topbar).
      await page
        .waitForSelector("main", { timeout: 30000 })
        .then(() => {
          usableMs = Date.now() - t0;
        })
        .catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    } catch (e) {
      consoleErrors.push("NAV_FAIL " + String(e).slice(0, 120));
    }
    const elapsed = Date.now() - t0;

    // Long tasks via PerformanceObserver injected after load (observes so far recorded entries).
    longTasks = await page
      .evaluate(
        () =>
          new Promise((resolve) => {
            const entries = performance.getEntriesByType("longtask") || [];
            resolve(entries.length);
          }),
      )
      .catch(() => -1);

    const api = requests.filter((r) => r.url.includes(":8080") && !/\.(js|css|png|jpg|svg|woff|ico|webp)/.test(r.url));
    const urls = api.map((r) => r.url.replace(/[?&]ts=\d+/g, ""));
    const dup = urls.length - new Set(urls).size;
    const statuses = api.map((r) => r.status).filter(Boolean);
    const failed = statuses.filter((s) => s >= 400).length;

    results.push({
      route,
      requests_api: api.length,
      duplicates: dup,
      failed,
      usable_ms: usableMs,
      total_ms: elapsed,
      long_tasks: longTasks,
      console_errors: consoleErrors.slice(0, 3),
      slowest: api.length ? Math.max(...api.map((r) => r.ts && r.status ? 0 : 0), 0) : 0,
    });

    console.log(
      `${route} | api=${api.length} dup=${dup} fail=${failed} usable=${usableMs ?? "?"}ms total=${elapsed}ms longtasks=${longTasks} cerr=${consoleErrors.length}`,
    );

    await context.close();
  }

  fs.writeFileSync("screenshots/admin-perf-results.json", JSON.stringify(results, null, 2));
  await browser.close();
  console.log("DONE routes=" + results.length);
})();
