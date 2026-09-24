import { describe, expect, it } from "vitest";
import {
  CHECKOUT_DRAFT_STORAGE_KEY,
  clearCheckoutDraft,
  emptyCheckoutDraft,
  loadCheckoutDraft,
  sanitizeCheckoutDraft,
  saveCheckoutDraft,
} from "@/lib/checkout-draft";
import {
  hasAuthoritativeFailure,
  isConfirmedPayment,
  mapProviderFailureKind,
  PROVIDER_DECLINED_STATUSES,
  type PaymentCompletionState,
} from "@/lib/payment-client-state";
import { paymentSuccessReducer } from "@/lib/payment-success-state";

/**
 * Minimal Web Storage harness — the suite runs in the default node
 * environment, so a tiny `window` stand-in (exactly the surface
 * checkout-draft.ts consumes) keeps these tests hermetic while exercising
 * the same read/write paths as the browser.
 */
function installStorage() {
  const backing = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => void backing.clear(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });
  return backing;
}

describe("checkout draft persistence", () => {
  it("persists allowed fields and restores them (refresh-survival contract)", () => {
    const backing = installStorage();
    saveCheckoutDraft({
      fullName: "Ada Obi",
      email: "ada@example.com",
      phone: "+2348012345678",
      state: "Lagos",
      lga: "Ikeja",
      city: "Victoria Island",
      address: "12 Ozumba Mbadiwe Avenue",
    });
    expect(backing.get(CHECKOUT_DRAFT_STORAGE_KEY)).toBeTruthy();
    const restored = loadCheckoutDraft();
    expect(restored).toEqual({
      fullName: "Ada Obi",
      email: "ada@example.com",
      phone: "+2348012345678",
      state: "Lagos",
      lga: "Ikeja",
      city: "Victoria Island",
      address: "12 Ozumba Mbadiwe Avenue",
    });
  });

  it("drops unknown keys — sensitive payment data can never enter the draft", () => {
    const hostile = {
      fullName: "Ada Obi",
      cardNumber: "4111111111111111",
      cvv: "123",
      pin: "1234",
      otp: "000000",
      authorizationToken: "secret",
      password: "hunter2",
      paystackAuthUrl: "https://checkout.paystack.com/xyz",
      __proto__: { evil: true },
    };
    const sanitized = sanitizeCheckoutDraft(hostile);
    expect(sanitized).toEqual({ ...emptyCheckoutDraft, fullName: "Ada Obi" });
    expect(JSON.stringify(sanitized)).not.toContain("4111");
    expect(JSON.stringify(sanitized)).not.toContain("hunter2");
    // Even if something wrote a hostile blob directly into storage:
    const backing = installStorage();
    backing.set(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(hostile));
    const loaded = loadCheckoutDraft();
    expect(loaded).toEqual({ ...emptyCheckoutDraft, fullName: "Ada Obi" });
    expect(JSON.stringify(loaded)).not.toContain("cvv");
  });

  it("length-caps fields and survives corrupt payloads", () => {
    installStorage();
    saveCheckoutDraft({ ...emptyCheckoutDraft, address: "x".repeat(500) });
    expect(loadCheckoutDraft().address.length).toBe(240);

    const backing = installStorage();
    backing.set(CHECKOUT_DRAFT_STORAGE_KEY, "{not json");
    expect(loadCheckoutDraft()).toEqual(emptyCheckoutDraft);
  });

  it("clear removes the draft (authoritative-success path)", () => {
    installStorage();
    saveCheckoutDraft({ ...emptyCheckoutDraft, email: "a@b.c" });
    clearCheckoutDraft();
    expect(loadCheckoutDraft()).toEqual(emptyCheckoutDraft);
  });
});

describe("provider failure taxonomy", () => {
  it("classifies provider-declined statuses as declined", () => {
    expect(mapProviderFailureKind("failed")).toBe("declined");
    for (const status of PROVIDER_DECLINED_STATUSES) {
      expect(mapProviderFailureKind(status)).toBe("declined");
    }
  });

  it("never labels transport/processing outcomes as declined", () => {
    expect(mapProviderFailureKind("abandoned")).toBe("failed");
    expect(mapProviderFailureKind("ongoing")).toBe("failed");
    expect(mapProviderFailureKind("processing")).toBe("failed");
    expect(mapProviderFailureKind("unknown_future_status")).toBe("failed");
  });

  it("authoritative failures carry taxonomy + provider status; transport errors do not", () => {
    const declined: PaymentCompletionState = {
      ok: false,
      message: "declined",
      failure_kind: "declined",
      provider_status: "failed",
      provider_reason: "Do not honor",
    };
    expect(hasAuthoritativeFailure(declined)).toBe(true);

    const transport: PaymentCompletionState = {
      ok: false,
      message: "We could not confirm this payment yet.",
    };
    expect(hasAuthoritativeFailure(transport)).toBe(false);
  });

  it("confirmation authority requires both ok and payment_confirmed", () => {
    expect(isConfirmedPayment({ ok: true, payment_confirmed: true })).toBe(true);
    expect(isConfirmedPayment({ ok: true })).toBe(false);
    expect(isConfirmedPayment({ ok: false, payment_confirmed: true })).toBe(false);
  });
});

describe("success-page reducer failure semantics", () => {
  const base = { payment: "checking", failureKind: null, receipt: "idle", order: null, message: "" } as const;

  it("records declined with the truthful label path", () => {
    const next = paymentSuccessReducer(base, {
      type: "payment",
      status: "failed",
      failureKind: "declined",
      message: "Your payment was declined by the payment provider.",
    });
    expect(next.payment).toBe("failed");
    expect(next.failureKind).toBe("declined");
  });

  it("keeps transport ambiguity distinct from decline", () => {
    const next = paymentSuccessReducer(base, {
      type: "payment",
      status: "failed",
      message: "Payment verification could not be completed.",
    });
    expect(next.payment).toBe("failed");
    expect(next.failureKind).toBeNull();
  });

  it("paid remains monotonic — late failures cannot downgrade it", () => {
    const paid = paymentSuccessReducer(base, {
      type: "paid",
      order: {
        reference: "DG-TEST-REF-001",
        paymentStatus: "paid",
        total: 95000,
        currency: "NGN",
        items: [],
      },
      receipt: "pending",
    });
    const afterLateFailure = paymentSuccessReducer(paid, {
      type: "payment",
      status: "failed",
      failureKind: "declined",
      message: "late",
    });
    expect(afterLateFailure).toBe(paid);
  });
});
