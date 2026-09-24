/**
 * Skeleton→content capture under realistic network throttling (CDP), at every
 * required viewport. Screenshots + DOM measurements of the early streamed
 * frame and the settled hydrated frame. No app mutations.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");

const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:4203";
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440];
const EXEC = "C:/Users/User/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const OUT = process.env.AUDIT_OUT || "screenshots/viewport-audit";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (80 * 1024) / 8,
    uploadThroughput: (40 * 1024) / 8,
  });
  return cdp;
}

async function measure(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n);
    const ratio = (w, h) => (h ? +(w / h).toFixed(3) : null);
    const doc = document.documentElement;
    const pulses = [...document.querySelectorAll(".animate-pulse")];
    const out = {
      url: location.pathname,
      pageHorizontalOverflow: Math.max(0, doc.scrollWidth - window.innerWidth),
      pulseCount: pulses.length,
      bodyChildren: document.body.children.length,
      headerPresent: !!document.querySelector("header"),
    };
    const skImg = pulses.find((e) => e.className.includes("aspect-"));
    if (skImg) {
      const sr = skImg.getBoundingClientRect();
      out.skeletonImage = { w: round(sr.width), h: round(sr.height), ratio: ratio(sr.width, sr.height) };
      const cardRoot = skImg.closest("[class*='rounded-2xl']");
      if (cardRoot) {
        const cr = cardRoot.getBoundingClientRect();
        out.skeletonCard = { w: round(cr.width), h: round(cr.height) };
      }
    }
    const aside = document.querySelector("aside");
    if (aside && getComputedStyle(aside).display !== "none") {
      const cs = getComputedStyle(aside);
      const ar = aside.getBoundingClientRect();
      const items = [...aside.querySelectorAll("label, a, button")].filter((e) => e.getBoundingClientRect().height > 0);
      out.sidebar = {
        exists: true,
        overflowY: cs.overflowY,
        maxHeight: cs.maxHeight,
        height: round(ar.height),
        items: items.length,
        internalScroll: [aside, ...aside.querySelectorAll("*")].some((el) => {
          const s = getComputedStyle(el);
          return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2;
        }),
        clippedItems: items.filter((e) => {
          const r = e.getBoundingClientRect();
          return r.bottom > ar.bottom + 1 || r.top < ar.top - 1;
        }).length,
      };
    }
    const realCards = [...document.querySelectorAll("a[href^='/products/']")];
    if (realCards.length) {
      const r = realCards[0].getBoundingClientRect();
      out.realCard = { w: round(r.width), h: round(r.height) };
      const img = realCards[0].querySelector("[class*='aspect-']");
      if (img) {
        const ir = img.getBoundingClientRect();
        out.realImage = { w: round(ir.width), h: round(ir.height), ratio: ratio(ir.width, ir.height) };
      }
      const h3 = realCards[0].querySelector("h3");
      if (h3) {
        const cs = getComputedStyle(h3);
        out.realTitle = {
          clamp: cs.webkitLineClamp || cs.lineClamp || null,
          minH: cs.minHeight,
          underline: getComputedStyle(h3.closest("a") || h3).textDecorationLine,
        };
      }
      out.realCardHasAction = !!realCards[0].querySelector("button");
    }
    return out;
  });
}

const browser = await chromium.launch({ executablePath: EXEC });
const results = [];
try {
  for (const width of WIDTHS) {
    const entry = { viewport: width };
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const cdp = await throttle(page);
    try {
      // --- Early frame (survives Clerk handshake context swaps) ---
      page.goto(`${BASE}/shop`, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
      entry.early = null;
      for (let i = 0; i < 12 && !entry.early; i++) {
        await sleep(450);
        entry.early = await measure(page).catch(() => null);
        if (!entry.early) await page.waitForSelector(".animate-pulse", { timeout: 900 }).catch(() => {});
      }
      if (entry.early) await page.screenshot({ path: `${OUT}/shop-early-${width}.png` }).catch(() => {});

      // --- Settled frame ---
      await page.waitForSelector("a[href^='/products/']", { timeout: 60000 }).catch(() => {});
      await sleep(1000);
      entry.settled = await measure(page).catch((e) => ({ err: String(e).slice(0, 80) }));
      await page.screenshot({ path: `${OUT}/shop-settled-${width}.png` }).catch(() => {});

      // deltas
      if (entry.early?.skeletonCard && entry.settled?.realCard) {
        entry.cardHeightDelta = Math.abs(entry.early.skeletonCard.h - entry.settled.realCard.h);
      }
      if (entry.early?.skeletonImage && entry.settled?.realImage) {
        entry.imageRatioDelta = Math.abs((entry.early.skeletonImage.ratio ?? 1) - (entry.settled.realImage.ratio ?? 1));
      }
    } catch (e) {
      entry.error = String(e).slice(0, 140);
    }
    await page.close();
    results.push(entry);
    console.log(JSON.stringify(entry));
  }
} finally {
  await browser.close();
}
console.log("AUDIT_COMPLETE");
