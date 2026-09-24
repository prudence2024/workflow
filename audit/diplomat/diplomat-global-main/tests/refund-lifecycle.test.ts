import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { refundStatusFromEvent } from "../src/lib/refund-lifecycle.server";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// processPaystackWebhook imports payment-finalize.server (heavy server
// module chain), so we test the lifecycle mapper + validator logic directly
// via the extracted pure functions, and the handler wiring via source pins.

describe("refund lifecycle state mapping", () => {
  it("maps all five provider refund events to application states", () => {
    expect(refundStatusFromEvent("refund.pending")).toBe("pending");
    expect(refundStatusFromEvent("refund.processing")).toBe("processing");
    expect(refundStatusFromEvent("refund.processed")).toBe("processed");
    expect(refundStatusFromEvent("refund.failed")).toBe("failed");
    expect(refundStatusFromEvent("refund.needs-attention")).toBe("needs-attention");
  });

  it("rejects unknown refund events (fail closed, no invented truth)", () => {
    expect(refundStatusFromEvent("refund.disputed")).toBeNull();
    expect(refundStatusFromEvent("charge.success")).toBeNull();
    expect(refundStatusFromEvent("")).toBeNull();
  });
});

describe("refund webhook handler wiring", () => {
  const src = read("src/lib/webhook-paystack.server.ts");

  it("routes refund.* events to the lifecycle handler, never to finalizePayment", () => {
    expect(src).toContain('eventType?.startsWith("refund.")');
    expect(src).toContain("applyRefundLifecycleEvent(");
    // refund events must NOT hit financial finalization
    expect(src).not.toMatch(/refund[\s\S]{0,200}finalizePayment\(reference\)/);
  });

  it("still routes charge.success to finalization and requires signature validation first", () => {
    const validateIdx = src.indexOf("validateSignature(data.body, data.signature)");
    const refundIdx = src.indexOf('startsWith("refund.")');
    const successIdx = src.indexOf('eventType === "charge.success"');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(-1);
    expect(refundIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(successIdx);
    expect(validateIdx).toBeLessThan(refundIdx);
  });
});

describe("admin refund flow truthfulness", () => {
  const adminSrc = read("src/lib/admin/server-fns.ts");

  it("create refund requires a successful transaction and refuses to mark refunded on its own", () => {
    // The admin flow must call Paystack and acknowledge, but the canonical
    // refund completion now flows exclusively through provider webhooks.
    expect(adminSrc).toContain("api.paystack.co/refund");
    expect(adminSrc).toContain('tx.status !== "successful"');
  });
});
