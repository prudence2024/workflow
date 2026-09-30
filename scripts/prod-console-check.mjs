/**
 * Production-mode browser console check.
 *
 * Visits public routes of a `next start` server (no login is possible there
 * by design: without Clerk keys production refuses all sessions) and fails
 * loudly on any React console error or pageerror — e.g. hydration warnings.
 *
 * Usage: node scripts/prod-console-check.mjs [baseUrl]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? process.env.PROD_BASE_URL ?? "http://localhost:3112";

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"),
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"),
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);
const exe = CANDIDATES.find((c) => c && existsSync(c));

const ROUTES = ["/", "/pricing", "/login", "/signup", "/product", "/dashboard"];

const errors = [];
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text().slice(0, 200));
});
page.on("pageerror", (err) => errors.push(`pageerror: ${String(err.message).slice(0, 200)}`));

for (const url of ROUTES) {
  const res = await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  console.log(`${url} -> ${res?.status()}`);
}
await browser.close();

const uniq = [...new Set(errors)];
if (uniq.length === 0) {
  console.log("\nPROD CONSOLE CLEAN");
} else {
  console.log(`\nPROD CONSOLE ERRORS (${uniq.length}):`);
  for (const e of uniq.slice(0, 15)) console.log(`  - ${e}`);
  process.exit(1);
}
