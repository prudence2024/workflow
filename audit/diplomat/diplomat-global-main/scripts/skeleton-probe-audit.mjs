/**
 * Skeleton geometry probe (runtime, race-free, server-independent):
 *  1. Vite SSR-loads the REAL skeleton components (same source the app ships).
 *  2. Renders them into probe containers replicating the live grid contexts
 *     (shop flex+aside included), styled by the artifact's compiled Tailwind
 *     CSS, inlined into a temp HTML file loaded via file:// — no server needed.
 *  3. Playwright measures true skeleton DOM geometry at every owner viewport
 *     and diffs it against the hydrated-content metrics captured from the
 *     same build (audit-results.jsonl).
 * Diagnostic-only: the generated probe file is temporary, never committed.
 */
import { createRequire } from "node:module";
import { writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");

// --- 1. SSR-load the real skeleton components through Vite ---
const { createServer } = await import("vite");
const vite = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
const { ProductCardSkeleton, BlogPostSkeleton, ProductDetailSkeleton } =
  await vite.ssrLoadModule("/src/components/skeletons.tsx");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const S = (el) => renderToStaticMarkup(React.createElement(el));

// --- 2. Inline the artifact's compiled Tailwind CSS (hash-agnostic) ---
const staticDir = resolve(process.cwd(), ".vercel/output/static");
const cssFile = readdirSync(resolve(staticDir, "assets")).find((f) => f.startsWith("styles-") && f.endsWith(".css"));
const css = require("node:fs").readFileSync(resolve(staticDir, "assets", cssFile), "utf8");

const probeHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head><body class="bg-canvas text-ink">
<main class="mx-auto max-w-7xl px-5 pb-20 pt-4 sm:px-6">
  <div class="flex gap-8">
    <aside class="hidden w-56 shrink-0 space-y-6 lg:block">
      <div class="space-y-2">${'<label class="flex items-center gap-3 text-sm"><span class="size-5 rounded-md border border-border"></span><span>Category placeholder</span></label>'.repeat(7)}</div>
    </aside>
    <div id="shop-grid" class="grid flex-1 grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
      ${S(ProductCardSkeleton)}
      ${S(ProductCardSkeleton)}
    </div>
  </div>
  <div id="blog-grid" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" style="margin-top:24px">
    ${S(BlogPostSkeleton)}
  </div>
  <div id="pdp-wrap" class="mx-auto max-w-7xl px-5 py-8 sm:px-6 md:py-12" style="margin-top:24px">
    <div class="mt-5 grid gap-9 lg:grid-cols-2 lg:gap-14">
      ${S(ProductDetailSkeleton)}
    </div>
  </div>
</main>
</body></html>`;

const probePath = resolve(process.cwd(), "screenshots", "__skel-probe.html");
writeFileSync(probePath, probeHtml);

// --- 3. Measure at every viewport via file:// ---
const EXEC = "C:/Users/User/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440];
const browser = await chromium.launch({ executablePath: EXEC });
const results = [];
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    try {
      await page.goto(`file:///${probePath.replace(/\\/g, "/")}`, { waitUntil: "load", timeout: 20000 });
      await new Promise((r) => setTimeout(r, 300));
      const m = await page.evaluate(() => {
        const round = (n) => Math.round(n);
        const ratio = (w, h) => (h ? +(w / h).toFixed(3) : null);
        const rect = (el) => el.getBoundingClientRect();
        const firstCard = document.querySelector("#shop-grid > div");
        const cardImg = firstCard?.querySelector("[class*='aspect-']");
        const blogCard = document.querySelector("#blog-grid > div");
        const blogImg = blogCard?.querySelector("[class*='aspect-']");
        const pdpRoot = document.querySelector("#pdp-wrap");
        const pdpMedia = pdpRoot?.querySelector("[class*='aspect-']");
        return {
          card: firstCard ? { w: round(rect(firstCard).width), h: round(rect(firstCard).height) } : null,
          cardImgRatio: cardImg ? ratio(rect(cardImg).width, rect(cardImg).height) : null,
          blogImgRatio: blogImg ? ratio(rect(blogImg).width, rect(blogImg).height) : null,
          pdpMediaRatio: pdpMedia ? ratio(rect(pdpMedia).width, rect(pdpMedia).height) : null,
          pdpMediaW: pdpMedia ? round(rect(pdpMedia).width) : null,
        };
      });
      results.push({ viewport: width, skeleton: m });
      console.log(JSON.stringify(results[results.length - 1]));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await vite.close().catch(() => {});
  try { unlinkSync(probePath); } catch {}
}
console.log("PROBE_COMPLETE");
