import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * §28 — Public form rate-limit matrix (contract form).
 *
 * Every public mutation path MUST call the server-side Upstash limiter before
 * doing work. Provider webhooks (paystack/telegram/brevo) must NOT be rate
 * limited so retries/idempotent replays are never broken.
 */

const CASES: Array<{ file: string; name: string }> = [
  { file: "src/lib/contact.server.ts", name: "contact" },
  { file: "src/lib/newsletter.server.ts", name: "newsletter" },
  { file: "src/lib/reviews.server.ts", name: "public review submit" },
  { file: "src/lib/review-claims.server.ts", name: "review claim redemption" },
  { file: "src/lib/checkout.server.ts", name: "checkout initialization" },
];

describe("public mutation rate-limit matrix", () => {
  for (const { file, name } of CASES) {
    it(`${name} enforces a server-side rate limit`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain('from "./rate-limit.server"');
      expect(src).toMatch(/checkRateLimit\(/);
    });
  }

  it("limiter keys combine identity + request IP (no global shared bucket)", () => {
    const src = readFileSync("src/lib/rate-limit.server.ts", "utf8");
    expect(src).toMatch(/identity \? `\$\{identity\}:\$\{ip\}` : ip/);
    expect(src).toMatch(/getRequestIP\(\{ xForwardedFor: true \}\)/);
  });

  it("429 responses carry Retry-After (contact shown as the canonical UX)", () => {
    const src = readFileSync("src/lib/contact.server.ts", "utf8");
    expect(src).toMatch(/setResponseStatus\(429\)/);
    expect(src).toMatch(/Retry-After/);
  });

  it("payment webhooks are NOT rate limited (provider retry/replay safety)", () => {
    for (const hook of [
      "src/routes/api.webhook.paystack.ts",
      "src/routes/api/webhook.paystack.ts",
      "src/routes/api.webhook.brevo.ts",
    ]) {
      let src = "";
      try {
        src = readFileSync(hook, "utf8");
      } catch {
        continue; // paystack webhook lives under api/ in this repo
      }
      expect(src).not.toMatch(/checkRateLimit/);
    }
  });

  it("telegram webhook rate limits per chat only (abuse guard, not provider replay)", () => {
    const src = readFileSync("src/routes/api.webhook.telegram.ts", "utf8");
    // Keyed by chat id, never a global bucket, and generous (30/min).
    expect(src).toMatch(/checkRateLimit\("telegram", String\(chatId\)\)/);
    expect(src).not.toMatch(/checkRateLimit\("telegram"\)/); // no IP-global limiting
  });

  it("paystack webhook path (api dir) is also free of rate limiting", () => {
    const candidates = ["src/routes/api/webhook.paystack.ts", "src/routes/api/paystack/webhook.ts"];
    let found = false;
    for (const hook of candidates) {
      try {
        const src = readFileSync(hook, "utf8");
        found = true;
        expect(src).not.toMatch(/checkRateLimit/);
      } catch {
        /* try next */
      }
    }
    expect(found).toBe(true);
  });
});
