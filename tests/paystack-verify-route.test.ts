import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPaymentProviderUnavailableError extends Error {
    constructor() {
      super("Payment provider is not configured");
      this.name = "PaymentProviderUnavailableError";
    }
  }
  class MockPaymentVerificationError extends Error {
    constructor(message = "Payment could not be verified") {
      super(message);
      this.name = "PaymentVerificationError";
    }
  }

  return {
    getCurrentUser: vi.fn(),
    getCurrentOrg: vi.fn(),
    getPaymentForWorkspace: vi.fn(),
    verifyPaystackReference: vi.fn(),
    convergeVerifiedPayment: vi.fn(),
    PaymentProviderUnavailableError: MockPaymentProviderUnavailableError,
    PaymentVerificationError: MockPaymentVerificationError,
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentOrg: mocks.getCurrentOrg,
}));
vi.mock("@/lib/payments", () => ({
  convergeVerifiedPayment: mocks.convergeVerifiedPayment,
  getPaymentForWorkspace: mocks.getPaymentForWorkspace,
  PaymentProviderUnavailableError: mocks.PaymentProviderUnavailableError,
  PaymentVerificationError: mocks.PaymentVerificationError,
  verifyPaystackReference: mocks.verifyPaystackReference,
}));

import { POST } from "@/app/api/billing/paystack/verify/route";

const payment = {
  id: "payment-1",
  provider: "paystack",
  providerReference: "paystack-reference",
  status: "pending",
  amount: 100000,
  currency: "NGN",
};

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/billing/paystack/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Paystack verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.getCurrentOrg.mockResolvedValue({ orgId: "org-1" });
    mocks.getPaymentForWorkspace.mockResolvedValue(payment);
    mocks.verifyPaystackReference.mockResolvedValue({
      providerTransactionId: "transaction-1",
      paidAt: new Date("2026-10-16T00:00:00.000Z"),
      paymentMethod: "card",
    });
    mocks.convergeVerifiedPayment.mockResolvedValue({ id: "payment-1", status: "verified" });
  });

  it("rejects a reference mismatch before contacting Paystack", async () => {
    const response = await POST(request({ paymentId: "payment-1", reference: "wrong-reference" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Payment verification could not be started" });
    expect(mocks.verifyPaystackReference).not.toHaveBeenCalled();
  });

  it("returns a safe error for a provider amount or currency mismatch", async () => {
    mocks.verifyPaystackReference.mockRejectedValue(
      new mocks.PaymentVerificationError("Payment amount or currency did not match"),
    );

    const response = await POST(request({ paymentId: "payment-1", reference: "paystack-reference" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Payment amount or currency did not match" });
  });

  it("does not expose unexpected verification failures", async () => {
    mocks.verifyPaystackReference.mockRejectedValue(new Error("provider secret detail"));

    const response = await POST(request({ paymentId: "payment-1", reference: "paystack-reference" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "Payment verification failed" });
    expect(JSON.stringify(body)).not.toContain("provider secret detail");
  });
});
