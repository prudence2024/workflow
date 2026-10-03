/**
 * Browser form analysis helper (plain Node, never bundled for Workers).
 *
 * The Next.js server bundle must not contain Playwright/Chromium code
 * (OpenNext esbuild cannot bundle it for workerd), so rendered-DOM analysis
 * lives here and the Server Action invokes it as a child process with a
 * timeout. Output is JSON on stdout:
 *   { provider: "google", finalUrl, fields, diagnostics }
 * Failures exit non-zero with a single-line human-readable error on stderr.
 *
 * Usage: node scripts/analyze-form.mjs <form-url>
 */
import { lookup as dnsLookup } from "node:dns";
import { existsSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const dnsLookupAsync = promisify(dnsLookup);

function ipBlocked(ip) {
  if (ip === "169.254.169.254" || ip === "100.100.100.200") return true;
  if (isIP(ip) === 4) {
    const n = ip.split(".").reduce((a, p) => a * 256 + Number(p), 0) >>> 0;
    const b0 = (n >>> 24) & 0xff, b1 = (n >>> 16) & 0xff;
    if (b0 === 10 || b0 === 127 || (b0 === 172 && b1 >= 16 && b1 <= 31) ||
        (b0 === 192 && b1 === 168) || (b0 === 169 && b1 === 254) ||
        b0 === 0 || b0 >= 224 || (b0 === 100 && b1 >= 64 && b1 <= 127)) return true;
    return false;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fe80:") || l.startsWith("fc") ||
    l.startsWith("fd") || l.startsWith("ff");
}

async function assertUrlAllowed(raw) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) form URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URL are not allowed");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") ||
      host.endsWith(".local") || (!host.includes(".") && isIP(host) === 0)) {
    throw new Error("Internal hostnames are not allowed");
  }
  if (isIP(host) !== 0) {
    if (ipBlocked(host)) throw new Error("That address is not allowed for form analysis");
    return u.toString();
  }
  const addrs = (await dnsLookupAsync(host, { all: true })).map((r) => r.address);
  if (addrs.length === 0 || addrs.some(ipBlocked)) {
    throw new Error("That host resolves to an address that is not allowed for form analysis");
  }
  return u.toString();
}

function resolveChrome() {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return process.env.PLAYWRIGHT_CHROME_PATH;
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(process.env.LOCALAPPDATA ?? process.env.HOME ?? "", process.env.LOCALAPPDATA ? "ms-playwright" : ".cache/ms-playwright");
  for (const entry of readdirSync(cache)) {
    if (!entry.startsWith("chromium-") || entry.includes("headless-shell")) continue;
    for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const c = join(cache, entry, sub);
      if (existsSync(c)) return c;
    }
  }
  throw new Error("No Playwright Chromium found (set PLAYWRIGHT_CHROME_PATH)");
}

function parseQuestionText(rawText, index) {
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, 120);
  const label = text.replace(/\s*\*.*$/, "").trim() || `Question ${index + 1}`;
  const required = /\*/.test(text.slice(0, label.length + 3));
  return { label: label.slice(0, 80), required };
}

async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) throw new Error("Usage: node scripts/analyze-form.mjs <form-url>");
  if ((process.env.NEON_BRANCH ?? "").toLowerCase() === "production") {
    throw new Error("Refused on the production branch marker");
  }
  const url = await assertUrlAllowed(rawUrl);
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (route) => {
      try {
        await assertUrlAllowed(route.request().url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("form", { timeout: 20000 });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('div[role="listitem"]').forEach((li) => {
        const controls = Array.from(li.querySelectorAll('input, textarea, [role="radio"], [role="checkbox"], [role="listbox"]'));
        const first = controls[0];
        const role = first?.getAttribute('role') || '';
        const inputType = first?.getAttribute('type') || '';
        items.push({
          text: (li.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          hasTextarea: !!li.querySelector("textarea"),
          hasText: !!li.querySelector('input[type="text"], input:not([type])'),
          hasChoice: li.querySelectorAll('[role="radio"]').length > 0 ||
            li.querySelectorAll('[role="checkbox"]').length > 0,
          hasDropdown: !!li.querySelector('[role="listbox"]'),
          inputType,
          role,
          options: Array.from(li.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]')).map((el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 50),
        });
      });
      const hiddenEntries = Array.from(
        document.querySelectorAll('input[type="hidden"][name^="entry."]'),
      ).map((el) => el.getAttribute("name"));
      return { items, hiddenEntries };
    });
    const diagnostics = [];
    if (data.items.length === 0) {
      diagnostics.push("No questions were detected in the rendered form. It may require sign-in, be closed, or use an unsupported layout.");
    }
    const fields = data.items.map((item, index) => {
      const { label, required } = parseQuestionText(item.text, index);
      const control = item.hasTextarea ? "textarea" : item.hasText ? (item.inputType || "text")
        : item.hasChoice ? (item.role === "checkbox" ? "checkbox" : "choice") : item.hasDropdown ? "dropdown" : "unknown";
      const entryName = data.hiddenEntries[index] ?? null;
      return {
        name: entryName ?? `question_${index}`,
        label,
        type: control === "textarea" ? "textarea" : (label.toLowerCase().includes("email") ? "email" : label.toLowerCase().match(/phone|mobile|tel/) ? "tel" : label.toLowerCase().match(/date/) ? "date" : label.toLowerCase().match(/number|age/) ? "number" : control),
        required,
        options: item.options,
        provider: "google",
        providerFieldId: entryName ?? undefined,
        selector: { kind: "google-question", label, index },
      };
    });
    const labels = fields.map((f) => f.label.toLowerCase());
    if (new Set(labels).size !== labels.length) diagnostics.push("Duplicate question labels were detected; review the mapping before running.");
    if (fields.some((f) => f.type === "unknown")) {
      diagnostics.push("Some questions have an unsupported control type and cannot be filled automatically.");
    }
    console.log(JSON.stringify({ provider: "google", finalUrl: page.url(), fields, diagnostics }));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message ?? err}\n`);
  process.exitCode = 1;
});
