import { describe, expect, it } from "vitest";
import {
  loadPaymentSuccessDetails,
  paymentSuccessInputSchema,
} from "../src/lib/payment-success.server";
import {
  initialPaymentSuccessState,
  paymentSuccessReducer,
} from "../src/lib/payment-success-state";
import { buildCheckoutQuote } from "../src/lib/checkout-quote";

const reference = "DG-AUDIT-12345678";
const token = "44444444-4444-4444-8444-444444444444";
const quote = buildCheckoutQuote({
  items: [{ productId: "product", quantity: 1 }],
  products: [
    {
      id: "product",
      name: "Fixture",
      sku: "FIX",
      price: 85000,
      status: "active",
      inventory: { quantity: 10 },
    },
  ],
  coupon: null,
  couponRequested: false,
  deliveryFee: 10000,
  freeDeliveryEnabled: false,
  freeDeliveryThreshold: 0,
});
function fixture(mode = "ready") {
  const calls: string[] = [];
  const order = {
    id: "order",
    reference,
    status: mode === "unpaid" ? "pending" : "paid",
    payment_reference: reference,
    subtotal: 85000,
    discount: 0,
    delivery_fee: 10000,
    total: 95000,
    currency: "NGN",
    coupon_id: null,
    order_items: quote.items.map(({ cost_price: _cost, ...item }) => item),
  };
  const transaction = {
    id: "transaction",
    reference,
    order_id: "order",
    amount: 95000,
    currency: "NGN",
    status: "successful",
    metadata: { quote_version: 2, order_id: "order", order_reference: reference, quote },
  };
  const db = {
    from(table: string) {
      calls.push(table);
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => {
          if (table === "payment_transactions")
            return { data: mode === "missing" ? null : transaction, error: null };
          if (table === "orders") return { data: order, error: null };
          if (table === "receipts") {
            if (mode === "throws") throw new Error("unavailable");
            if (mode === "error") return { data: null, error: { message: "private DB error" } };
            if (mode === "pending") return { data: null, error: null };
            if (!filters.download_token) {
              expect(filters).toEqual({ order_id: "order", transaction_id: "transaction" });
            }
            return { data: { transaction_id: "transaction", download_token: token }, error: null };
          }
          throw new Error("Unexpected table " + table);
        },
      };
      return query;
    },
  };
  return {
    db: db as unknown as Parameters<typeof loadPaymentSuccessDetails>[0],
    calls,
    transaction,
    order,
  };
}

describe("read-only success and receipt recovery", () => {
  for (const [mode, receiptState] of [
    ["ready", "ready"],
    ["pending", "pending"],
    ["error", "error"],
    ["throws", "error"],
  ]) {
    it(`keeps paid authority with receipt ${mode}`, async () => {
      const f = fixture(mode);
      expect(await loadPaymentSuccessDetails(f.db, { reference })).toMatchObject({
        ok: true,
        payment_confirmed: true,
        receiptState,
        order: { total: 95000 },
      });
    });
  }
  for (const mode of ["missing", "unpaid"])
    it(`never confirms ${mode} payment`, async () => {
      expect(await loadPaymentSuccessDetails(fixture(mode).db, { reference })).toMatchObject({
        ok: false,
      });
    });
  it("rejects amount/reference binding mismatch", async () => {
    const f = fixture();
    f.transaction.amount = 1;
    expect(await loadPaymentSuccessDetails(f.db, { reference })).toMatchObject({ ok: false });
    f.transaction.amount = 95000;
    f.order.payment_reference = "different";
    expect(await loadPaymentSuccessDetails(f.db, { reference })).toMatchObject({ ok: false });
  });
  it("refresh with a valid opaque token recovers paid status", async () => {
    expect(await loadPaymentSuccessDetails(fixture().db, { receiptToken: token })).toMatchObject({
      ok: true,
      payment_confirmed: true,
    });
    expect(paymentSuccessInputSchema.safeParse({ receiptToken: "guess" }).success).toBe(false);
    expect(paymentSuccessInputSchema.safeParse({}).success).toBe(false);
  });
  it("retry performs fresh reads and replaces receipt failure without any mutation API", async () => {
    const first = await loadPaymentSuccessDetails(fixture("error").db, { reference });
    const f = fixture();
    const second = await loadPaymentSuccessDetails(f.db, { reference });
    expect(first).toMatchObject({ receiptState: "error" });
    expect(second).toMatchObject({ receiptState: "ready", order: { receiptToken: token } });
    expect(f.calls).toEqual(["payment_transactions", "orders", "receipts"]);
  });
});

describe("monotonic payment state", () => {
  const order = { reference, paymentStatus: "paid", total: 95000, currency: "NGN", items: [] };
  const paid = paymentSuccessReducer(initialPaymentSuccessState, {
    type: "paid",
    order,
    receipt: "ready",
  });
  for (const status of ["loading", "pending", "error"] as const)
    it(`receipt ${status} cannot downgrade payment`, () => {
      expect(paymentSuccessReducer(paid, { type: "receipt", status })).toMatchObject({
        payment: "paid",
        receipt: status,
        order,
      });
    });
  it("late payment errors cannot downgrade authoritative paid state", () => {
    expect(
      paymentSuccessReducer(paid, { type: "payment", status: "failed", message: "late" }),
    ).toEqual(paid);
  });
  it("unverified and pending states never imply paid", () => {
    expect(initialPaymentSuccessState.payment).toBe("checking");
    expect(
      paymentSuccessReducer(initialPaymentSuccessState, {
        type: "payment",
        status: "pending",
        message: "wait",
      }).payment,
    ).toBe("pending");
  });
});
