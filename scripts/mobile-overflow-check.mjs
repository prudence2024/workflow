import fs from "node:fs";
import process from "node:process";
import { chromium } from "playwright-core";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:3112").replace(/\/$/, "");
const viewports = [[320,568], [360,640], [375,667], [390,844], [412,915], [430,932]];
const routes = [
  "/dashboard",
  "/contacts",
  "/imports",
  "/campaigns",
  "/communications",
  "/reports",
  "/settings",
  "/form-operations",
];

function findBrowser() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : null,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const executablePath = findBrowser();
if (!executablePath) {
  throw new Error("No Chromium-compatible executable found. Set CHROME_EXECUTABLE_PATH.");
}

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];

try {
  for (const [width, height] of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.getByRole('button', { name: 'Account menu', exact: true }).waitFor({timeout:15_000});
        if (!response?.ok()) throw new Error(`Route response was not successful: ${route}`);
        const metrics = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          path: window.location.pathname,
        }));
        if (metrics.path !== route) {
          throw new Error(`Authenticated route not reached: ${route}. Width acceptance cannot be recorded.`);
        }
        if (metrics.scrollWidth > metrics.clientWidth + 1) {
          failures.push({ width, route, ...metrics });
        }
        console.log(`${width}px ${route} ${metrics.scrollWidth <= metrics.clientWidth + 1 ? "PASS" : "FAIL"}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exitCode = 1;
}
