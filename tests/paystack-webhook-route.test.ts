import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPaymentVerificationError extends Error {
    constructor(message = "Payment could not be verified") {
      super(message);
      this.name = "PaymentVerificationError";
    }
  }

  return {
    verifyPaystackSignature: vi.fn(),
    recordWebhookEvent: vi.fn(),
    markWebhookProcessed: vi.fn(),
    convergePaystackWebhook: vi.fn(),
    PaymentVerificationError: MockPaymentVerificationError,
  };
});

vi.mock("@/lib/payments", () => ({
  convergePaystackWebhook: mocks.convergePaystackWebhook,
  PaymentVerificationError: mocks.PaymentVerificationError,
}));
vi.mock("@/lib/webhooks", () => ({
  markWebhookProcessed: mocks.markWebhookProcessed,
  recordWebhookEvent: mocks.recordWebhookEvent,
  verifyPaystackSignature: mocks.verifyPaystackSignature,
}));

import { POST } from "@/app/api/webhooks/paystack/route";

const validPayload = {
  event: "charge.success",
  data: {
    id: 12345,
    reference: "paystack-reference",
    amount: 100000,
    currency: "NGN",
    status: "success",
    paid_at: "2026-10-16T00:00:00.000Z",
    channel: "card",
  },
};

function request(payload = validPayload): Request {
  return new Request("http://localhost/api/webhooks/paystack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": "test-signature",
    },
    body: JSON.stringify(payload),
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Paystack webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = "test-secret";
    mocks.verifyPaystackSignature.mockReturnValue(true);
    mocks.recordWebhookEvent.mockResolvedValue({ id: "event-1", duplicate: false, retryable: false });
    mocks.markWebhookProcessed.mockResolvedValue(undefined);
    mocks.convergePaystackWebhook.mockResolvedValue({ id: "payment-1", status: "verified" });
  });

  it("rejects an invalid signature before recording or converging", async () => {
    mocks.verifyPaystackSignature.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "invalid signature" });
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.convergePaystackWebhook).not.toHaveBeenCalled();
  });

  it("treats a processed replay as a successful no-op", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ id: "event-1", duplicate: true, retryable: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ ok: true, duplicate: true });
    expect(mocks.convergePaystackWebhook).not.toHaveBeenCalled();
  });

  it("returns a safe client error for provider amount/reference conflicts", async () => {
    mocks.convergePaystackWebhook.mockRejectedValue(
      new mocks.PaymentVerificationError("Payment amount or currency did not match"),
    );

    const response = await POST(request({
      ...validPayload,
      data: { ...validPayload.data, reference: "mismatched-reference", amount: 1 },
    }));

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "payment processing failed" });
    expect(mocks.markWebhookProcessed).toHaveBeenCalledWith("event-1", "failed", "Payment amount or currency did not match");
  });

  it("does not expose unexpected provider or database failures", async () => {
    mocks.convergePaystackWebhook.mockRejectedValue(new Error("secret provider detail"));

    const response = await POST(request());
    const body = await responseJson(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "payment processing failed" });
    expect(JSON.stringify(body)).not.toContain("secret provider detail");
  });
});
