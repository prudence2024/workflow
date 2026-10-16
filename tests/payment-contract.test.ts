import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("payment safety contracts", () => {
  it("does not return an idempotency collision across workspaces", () => {
    const source = readFileSync("src/lib/payments.ts", "utf8");
    expect(source).toContain("on conflict (idempotency_key) do nothing");
    expect(source).toContain("and org_id = ${input.orgId}::uuid");
    expect(source).not.toContain("on conflict (idempotency_key) do update");
  });

  it("requires the Paystack webhook to use signed, successful provider data", () => {
    const source = readFileSync("src/app/api/webhooks/paystack/route.ts", "utf8");
    expect(source).toContain("verifyPaystackSignature");
    expect(source).toContain('body.event !== "charge.success"');
    expect(source).toContain('data.status !== "success"');
    expect(source).toContain("convergePaystackWebhook");
  });

  it("bounds Paystack verification and cleans up the timeout", () => {
    const source = readFileSync("src/lib/payments.ts", "utf8");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("clearTimeout(timeout)");
  });
});
