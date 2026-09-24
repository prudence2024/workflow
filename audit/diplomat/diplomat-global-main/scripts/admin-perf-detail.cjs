const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:8080";
const route = process.argv[2] || "/dashboard";

(async () => {
  const state = JSON.parse(fs.readFileSync("admin-owner.state", "utf8"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const reqs = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes(":8080")) return;
    const ct = (res.headers()["content-type"] || "").split(";")[0];
    reqs.push({ url: u.replace(BASE, ""), status: res.status(), ct, ms: null, size: null });
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`CONSOLE_${m.type().toUpperCase()}: ${m.text().slice(0, 220)}`);
  });

  const t0 = Date.now();
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const elapsed = Date.now() - t0;

  const landmarks = await page.evaluate(() => ({
    hasMain: !!document.querySelector("main"),
    h1: document.querySelector("h1")?.textContent?.slice(0, 60) ?? null,
    sidebar: !!document.querySelector("aside,[class*=sidebar]"),
    tables: document.querySelectorAll("table").length,
    cards: document.querySelectorAll("[class*=card]", ).length,
    bodyScrollW: document.body.scrollWidth,
    viewportW: window.innerWidth,
  })).catch(() => ({}));
  console.log("LANDMARKS " + JSON.stringify(landmarks));
  console.log("TOTAL_MS=" + elapsed);

  const interesting = reqs.filter((r) => !/\.(js|css|woff2?|png|svg|ico|webp)(\?|$)/.test(r.url) || r.url.includes("_server") || r.url.includes("serverFn"));
  for (const r of interesting) console.log(`REQ ${r.status} ${r.ct || "?"} ${r.url.slice(0, 130)}`);
  const urls = interesting.map((r) => r.url);
  const dup = Object.entries(urls.reduce((a, u) => ((a[u] = (a[u] || 0) + 1), a), {})).filter(([, n]) => n > 1);
  console.log("DUPES " + JSON.stringify(dup.map(([u, n]) => `${n}x ${u.slice(0, 110)}`)));
  const statics = reqs.length - interesting.length;
  console.log(`SUMMARY interesting=${interesting.length} static=${statics} total=${reqs.length}`);

  await browser.close();
})();
