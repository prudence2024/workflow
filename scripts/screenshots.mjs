/**
 * Capture real screenshots of the running application.
 *
 * Uses the Chromium already installed for this machine's Playwright cache, so
 * nothing is downloaded. Signs in through the real login form, then walks every
 * page — the images produced are the ones referenced by README.md, so they can
 * never drift from the shipped UI.
 *
 * Usage: node scripts/screenshots.mjs [baseUrl]
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? process.env.SHOT_BASE_URL ?? "http://localhost:3111";
const OUT = "docs/screenshots";
const EMAIL = process.env.SEED_EMAIL ?? "founder@workflow.dev";
const PASSWORD = process.env.SEED_PASSWORD ?? "Workflow2026!";

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"),
  path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"),
  "/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);

function findBrowser() {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const DESKTOP = { width: 1440, height: 960 };
const MOBILE = { width: 390, height: 844 };

const PAGES = [
  ["dashboard", "/dashboard"],
  ["records-contacts", "/contacts"],
  ["campaigns", "/campaigns"],
  ["campaign-detail", "/campaigns/00000000-0000-4000-8000-000000000800"],
  ["contact-detail", "/contacts/00000000-0000-4000-8000-000000000100"],
  ["imports", "/imports"],
  ["imports-new", "/imports/new"],
  ["communications", "/communications"],
  ["form-operations", "/form-operations"],
  ["templates", "/templates"],
  ["reports", "/reports"],
  ["workspace-settings", "/settings/organization"],
  ["usage", "/settings/usage"],
  ["platform-admin", "/platform-admin"],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findBrowser() });

  const shots = [];
  const consoleErrors = [];

  // ---- public surfaces -----------------------------------------------------
  const publicCtx = await browser.newContext({ viewport: DESKTOP });
  const publicPage = await publicCtx.newPage();
  for (const [name, url] of [
    ["homepage", "/"],
    ["pricing", "/pricing"],
    ["login", "/login"],
  ]) {
    await publicPage.goto(BASE + url, { waitUntil: "networkidle" });
    await publicPage.waitForTimeout(400);
    await publicPage.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    shots.push(`${name}`);
  }

  await publicPage.setViewportSize(MOBILE);
  await publicPage.goto(BASE + "/", { waitUntil: "networkidle" });
  await publicPage.waitForTimeout(400);
  await publicPage.screenshot({ path: `${OUT}/homepage-mobile.png` });
  shots.push("homepage-mobile");
  await publicCtx.close();

  // ---- authenticated session ----------------------------------------------
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  const landed = new URL(page.url()).pathname;
  console.log(`signed in → ${landed}`);
  await page.waitForLoadState("networkidle");

  for (const [name, url] of PAGES) {
    const response = await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const status = response?.status();
    await page.screenshot({ path: `${OUT}/${name}.png` });
    shots.push(`${name}${status && status >= 400 ? ` (HTTP ${status})` : ""}`);
    console.log(`  ${url} → ${status}`);
  }

  await page.setViewportSize(MOBILE);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/dashboard-mobile.png` });
  shots.push("dashboard-mobile");

  await ctx.close();
  await browser.close();

  console.log(`\ncaptured ${shots.length} screenshots into ${OUT}/`);
  console.log(shots.join(", "));
  if (consoleErrors.length > 0) {
    console.log(`\nbrowser console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 12)) console.log(`  - ${e}`);
  } else {
    console.log("\nno browser console errors during the walk-through");
  }
}

main().catch((err) => {
  console.error("screenshot run failed:", err.message);
  process.exit(1);
});
