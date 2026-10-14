/**
 * Rendered-DOM form analyzer. Plain Node + Playwright only; never bundled into
 * Cloudflare. It records the currently visible section and navigation affordances
 * without fabricating undiscovered conditional branches.
 */
import { lookup as dnsLookup } from "node:dns";
import { existsSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { isAllowedLocalFormRequest } from "./local-form-allowlist.mjs";
import { normalizeGoogleQuestionText } from "./google-question-label.mjs";

const dnsLookupAsync = promisify(dnsLookup);
function ipBlocked(ip) {
  if (ip === "169.254.169.254" || ip === "100.100.100.200") return true;
  if (isIP(ip) === 4) {
    const n = ip.split(".").reduce((a, p) => a * 256 + Number(p), 0) >>> 0;
    const b0 = (n >>> 24) & 0xff, b1 = (n >>> 16) & 0xff;
    return b0 === 10 || b0 === 127 || (b0 === 172 && b1 >= 16 && b1 <= 31) || (b0 === 192 && b1 === 168) || (b0 === 169 && b1 === 254) || b0 === 0 || b0 >= 224 || (b0 === 100 && b1 >= 64 && b1 <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fe80:") || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("ff");
}
async function assertUrlAllowed(raw, method = "GET") {
  const u = new URL(raw);
  if (isAllowedLocalFormRequest(raw, method)) return u.toString();
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) form URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URL are not allowed");
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || (!host.includes(".") && isIP(host) === 0)) throw new Error("Internal hostnames are not allowed");
  if (isIP(host) !== 0) { if (ipBlocked(host)) throw new Error("That address is not allowed for form analysis"); return u.toString(); }
  const addrs = (await dnsLookupAsync(host, { all: true })).map((r) => r.address);
  if (addrs.length === 0 || addrs.some(ipBlocked)) throw new Error("That host resolves to an address that is not allowed for form analysis");
  return u.toString();
}
function resolveChrome() {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) return process.env.PLAYWRIGHT_CHROME_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.LOCALAPPDATA ?? process.env.HOME ?? "", process.env.LOCALAPPDATA ? "ms-playwright" : ".cache/ms-playwright");
  for (const entry of readdirSync(cache)) {
    if (!entry.startsWith("chromium-") || entry.includes("headless-shell")) continue;
    for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const candidate = join(cache, entry, sub);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("No Playwright Chromium found (set PLAYWRIGHT_CHROME_PATH)");
}
async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) throw new Error("Usage: node scripts/analyze-form.mjs <form-url>");
  if ((process.env.NEON_BRANCH ?? "").toLowerCase() === "production") throw new Error("Refused on the production branch marker");
  const url = await assertUrlAllowed(rawUrl);
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (route) => { try { await assertUrlAllowed(route.request().url(), route.request().method()); await route.continue(); } catch { await route.abort(); } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("form", { timeout: 20000 });
    await page.waitForTimeout(1800);
    const data = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="listitem"]')).map((li) => {
        const first = li.querySelector('input, textarea, [role="radio"], [role="checkbox"], [role="listbox"]');
        const question = li.querySelector('[role="heading"], label');
        // Prefer the accessible question node. Remove only helper/hidden
        // descendants before falling back to the list item text.
        let questionText = question?.getAttribute("aria-label") || "";
        if (!questionText && question) {
          const clone = question.cloneNode(true);
          clone.querySelectorAll('[aria-hidden="true"], [role="note"], [data-tooltip]').forEach((node) => node.remove());
          questionText = clone.textContent || "";
        }
        if (!questionText) questionText = question?.textContent || li.textContent || "";
        return {
          text: (li.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          questionText: questionText.replace(/\s+/g, " ").trim().slice(0, 160),
          hasTextarea: Boolean(li.querySelector("textarea")),
          hasText: Boolean(li.querySelector('input[type="text"], input:not([type])')),
          hasChoice: li.querySelectorAll('[role="radio"]').length > 0 || li.querySelectorAll('[role="checkbox"]').length > 0,
          hasDropdown: Boolean(li.querySelector('[role="listbox"]')),
          inputType: first?.getAttribute("type") || "",
          role: first?.getAttribute("role") || "",
          options: Array.from(li.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]')).map((el) => (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 50),
        };
      });
      const buttons = Array.from(document.querySelectorAll('[role="button"], button')).map((el) => (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
      const sectionTitle = document.querySelector('[role="heading"], h1, h2, h3')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || "Form section 1";
      const hiddenEntries = Array.from(document.querySelectorAll('input[type="hidden"][name^="entry."]')).map((el) => el.getAttribute("name"));
      const bodyText = (document.body?.textContent || "").replace(/\s+/g, " ").slice(0, 5000);
      const challenge = /captcha|recaptcha|verify you are human|one[- ]time password|\botp\b|sign in to continue/i.test(bodyText) || Boolean(document.querySelector('iframe[src*="recaptcha"], [aria-label*="CAPTCHA" i]'));
      return { items, hiddenEntries, challenge, sectionTitle, hasNext: buttons.some((button) => /^(next|continue|proceed|go to next)/.test(button)), hasSubmit: buttons.some((button) => /^(submit|send|finish|complete)/.test(button)), pageSignature: `${location.pathname}|${sectionTitle}|${items.map((item) => item.text).join("|")}`.slice(0, 500) };
    });
    const diagnostics = [];
    const warnings = [];
    if (data.challenge) diagnostics.push("The destination presented a CAPTCHA, OTP, sign-in, or human-verification challenge.");
    if (data.items.length === 0) diagnostics.push("No questions were detected in the rendered form. It may require sign-in, be closed, or use an unsupported layout.");
    if (data.hasNext && !data.hasSubmit) warnings.push("This is a dynamic-sections form; the submission worker will discover later pages at runtime.");
    const fields = data.items.map((item, index) => {
      const { label, required } = normalizeGoogleQuestionText(item.questionText || item.text, index, item.text);
      const control = item.hasTextarea ? "textarea" : item.hasText ? (item.inputType || "text") : item.hasChoice ? (item.role === "checkbox" ? "checkbox" : "radio") : item.hasDropdown ? "select" : "unknown";
      const entryName = data.hiddenEntries[index] ?? undefined;
      const normalized = label.toLowerCase();
      const type = control === "textarea" ? "textarea" : normalized.includes("email") ? "email" : /phone|mobile|tel/.test(normalized) ? "tel" : normalized.includes("date") ? "date" : /number|age/.test(normalized) ? "number" : control;
      return { name: entryName ?? `question_${index}`, label, type, required, options: item.options, provider: "google", providerFieldId: entryName, selector: { kind: "google-question", label, index, providerFieldId: entryName }, pageIndex: 0, sectionId: "google-page-0", sectionTitle: data.sectionTitle };
    });
    const labels = fields.map((field) => field.label.toLowerCase());
    if (new Set(labels).size !== labels.length) diagnostics.push("Duplicate question labels were detected; review the mapping before running.");
    if (fields.some((field) => field.type === "unknown")) diagnostics.push("Some questions have an unsupported control type and cannot be filled automatically.");
    const state = data.challenge ? "human_action_required" : diagnostics.length > 0 ? "needs_attention" : "ready";
    console.log(JSON.stringify({ provider: "google", finalUrl: page.url(), fields, diagnostics, warnings, state, analysisMode: data.hasNext ? "dynamic-sections" : "single-page", navigation: { hasNext: data.hasNext, hasSubmit: data.hasSubmit, sectionTitle: data.sectionTitle, pageSignature: data.pageSignature } }));
  } finally { await browser.close().catch(() => {}); }
}
main().catch((err) => { process.stderr.write(`ERROR: ${err.message ?? err}\n`); process.exitCode = 1; });
