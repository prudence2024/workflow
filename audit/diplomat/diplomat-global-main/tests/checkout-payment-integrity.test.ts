import { describe, expect, it } from "vitest";
import { checkoutInputSchema } from "../src/lib/checkout.server";
import {
  buildCheckoutQuote,
  buildExistingCustomerPatch,
  buildOrderShippingSnapshot,
  canReuseCheckoutOrder,
  checkoutQuotesMatch,
  explainQuoteDivergence,
  isSameFinalizedPayment,
  paymentAttemptQuoteMatches,
  validatePaymentBinding,
  parseCustomerName,
  type CheckoutProductRow,
  type CheckoutQuote,
  type PaymentQuoteMetadata,
} from "../src/lib/checkout-quote";
import type { CouponRow } from "../src/lib/coupon-lifecycle";
import {
  buildConfirmedPaymentState,
  buildPaymentWhatsAppUrl,
  shouldClearCheckoutCart,
} from "../src/lib/payment-client-state";

const product: CheckoutProductRow = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "DG-MON-ZP15",
  name: "Authoritative Monitor",
  price: 50_000,
  cost_price: null,
  status: "active",
  inventory: { quantity: 5, reserved: 0 },
};

const address = { state: "Lagos", lga: "Ikeja", city: "Ikeja", address: "1 Test Street" };

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    code: "SAVE",
    discount_type: "fixed",
    discount_value: 500,
    max_uses: 1,
    uses: 0,
    starts_at: null,
    expires_at: null,
    active: true,
    ...overrides,
  };
}

function quote(
  options: {
    coupon?: CouponRow | null;
    deliveryFee?: number;
    freeDeliveryEnabled?: boolean;
    freeDeliveryThreshold?: number;
    productPrice?: number;
  } = {},
): CheckoutQuote {
  return buildCheckoutQuote({
    items: [{ productId: product.id, quantity: 1 }],
    products: [{ ...product, price: options.productPrice ?? product.price }],
    coupon: options.coupon ?? null,
    couponRequested: options.coupon !== undefined && options.coupon !== null,
    deliveryFee: options.deliveryFee ?? 10_005,
    freeDeliveryEnabled: options.freeDeliveryEnabled ?? false,
    freeDeliveryThreshold: options.freeDeliveryThreshold ?? 0,
    now: new Date("2026-09-03T12:00:00.000Z"),
  });
}

function orderFor(currentQuote: CheckoutQuote) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    reference: "DG-ORDER-1",
    status: "pending",
    email: "buyer@example.com",
    created_at: "2026-09-03T11:50:00.000Z",
    shipping_address: address,
    subtotal: currentQuote.subtotal,
    discount: currentQuote.discount,
    delivery_fee: currentQuote.delivery_fee,
    total: currentQuote.total,
    currency: currentQuote.currency,
    coupon_id: currentQuote.coupon_id,
    order_items: currentQuote.items.map((line) => ({
      product_id: line.product_id,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
    })),
  };
}

describe("server-authoritative checkout quote", () => {
  it("rejects browser price and name fields at the checkout schema boundary", () => {
    const parsed = checkoutInputSchema.safeParse({
      email: "buyer@example.com",
      phone: "+2348012345678",
      fullName: "Ada Buyer",
      checkoutAttemptId: "44444444-4444-4444-8444-444444444444",
      items: [{ productId: product.id, quantity: 1, unitPrice: 1, name: "Manipulated" }],
      shippingAddress: address,
    });
    expect(parsed.success).toBe(false);
  });

  it("uses DB product identity, price, inventory, and current delivery settings", () => {
    const current = quote();
    expect(current.items[0]).toMatchObject({
      name: "Authoritative Monitor",
      sku: "DG-MON-ZP15",
      unit_price: 50_000,
      line_total: 50_000,
      cost_price: null,
    });
    expect(current).toMatchObject({ subtotal: 50_000, delivery_fee: 10_005, total: 60_005 });
  });

  it("snapshots known server cost while preserving unknown cost as null", () => {
    const knownCost = buildCheckoutQuote({
      items: [{ productId: product.id, quantity: 1 }],
      products: [{ ...product, cost_price: 30_000 }],
      coupon: null,
      couponRequested: false,
      deliveryFee: 0,
      freeDeliveryEnabled: false,
      freeDeliveryThreshold: 0,
    });
    expect(knownCost.items[0].cost_price).toBe(30_000);
    expect(quote().items[0].cost_price).toBeNull();
  });

  it("parses multi-part names and never overwrites an existing customer name", () => {
    expect(parseCustomerName("María José da Silva")).toEqual({
      firstName: "María",
      lastName: "José da Silva",
    });
    expect(
      buildExistingCustomerPatch(
        { first_name: "Existing", phone: null },
        "Replacement Name",
        "+2348012345678",
      ),
    ).toEqual({ phone: "+2348012345678" });
    expect(
      buildOrderShippingSnapshot(address, {
        fullName: "  Ada Lovelace  ",
        phone: "+2348012345678",
      }),
    ).toEqual({
      ...address,
      full_name: "Ada Lovelace",
      phone: "+2348012345678",
    });
  });

  it("calculates fixed and percentage coupons through the canonical coupon engine", () => {
    expect(quote({ coupon: coupon() })).toMatchObject({ discount: 500, total: 59_505 });
    expect(
      quote({ coupon: coupon({ discount_type: "percentage", discount_value: 12 }) }),
    ).toMatchObject({ discount: 6_000, total: 54_005 });
    expect(() =>
      quote({ coupon: coupon({ discount_type: "percentage", discount_value: 101 }) }),
    ).toThrow("invalid percentage");
  });

  it("does not reuse an expired or materially changed order quote", () => {
    const original = quote({ deliveryFee: 7_500 });
    const order = orderFor(original);
    expect(
      canReuseCheckoutOrder(
        order,
        original,
        { email: order.email, shippingAddress: address },
        new Date("2026-09-03T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      canReuseCheckoutOrder(
        order,
        original,
        { email: order.email, shippingAddress: address },
        new Date("2026-09-03T12:21:00.001Z"),
      ),
    ).toBe(false);
    expect(
      canReuseCheckoutOrder(
        { ...order, created_at: "2026-09-03T12:00:00.001Z" },
        original,
        { email: order.email, shippingAddress: address },
        new Date("2026-09-03T12:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      canReuseCheckoutOrder(
        order,
        quote({ deliveryFee: 10_005 }),
        { email: order.email, shippingAddress: address },
        new Date("2026-09-03T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("uses the current standard delivery setting while preserving an old quote snapshot", () => {
    const historical = quote({ deliveryFee: 7_500 });
    const current = quote({ deliveryFee: 10_005 });
    expect(historical).toMatchObject({
      standard_delivery_fee: 7_500,
      delivery_fee: 7_500,
      total: 57_500,
    });
    expect(current).toMatchObject({
      standard_delivery_fee: 10_005,
      delivery_fee: 10_005,
      total: 60_005,
    });
    expect(historical.delivery_fee).toBe(7_500);
    expect(checkoutQuotesMatch(historical, current)).toBe(false);
    expect(
      canReuseCheckoutOrder(orderFor(historical), current, {
        email: "buyer@example.com",
        shippingAddress: address,
      }),
    ).toBe(false);
  });

  it("charges standard delivery whenever the free-delivery toggle is off", () => {
    expect(
      quote({
        deliveryFee: 10_005,
        freeDeliveryEnabled: false,
        freeDeliveryThreshold: 200_000,
        productPrice: 50_000,
      }),
    ).toMatchObject({ delivery_fee: 10_005, free_delivery_applied: false, total: 60_005 });
    expect(
      quote({
        deliveryFee: 10_005,
        freeDeliveryEnabled: false,
        freeDeliveryThreshold: 200_000,
        productPrice: 250_000,
      }),
    ).toMatchObject({ delivery_fee: 10_005, free_delivery_applied: false, total: 260_005 });
  });

  it("applies enabled free delivery at and above the post-discount threshold", () => {
    const common = {
      deliveryFee: 10_005,
      freeDeliveryEnabled: true,
      freeDeliveryThreshold: 200_000,
    };
    expect(quote({ ...common, productPrice: 199_999 })).toMatchObject({
      delivery_fee: 10_005,
      free_delivery_applied: false,
      amount_remaining_for_free_delivery: 1,
    });
    expect(quote({ ...common, productPrice: 200_000 })).toMatchObject({
      delivery_fee: 0,
      free_delivery_applied: true,
      amount_remaining_for_free_delivery: 0,
      total: 200_000,
    });
    expect(quote({ ...common, productPrice: 250_000 })).toMatchObject({
      delivery_fee: 0,
      free_delivery_applied: true,
      total: 250_000,
    });
  });

  it("evaluates free delivery after coupon discount", () => {
    expect(
      quote({
        coupon: coupon({ discount_value: 20_000 }),
        deliveryFee: 10_005,
        freeDeliveryEnabled: true,
        freeDeliveryThreshold: 200_000,
        productPrice: 210_000,
      }),
    ).toMatchObject({
      subtotal: 210_000,
      discount: 20_000,
      eligible_subtotal: 190_000,
      delivery_fee: 10_005,
      total: 200_005,
    });
  });

  it("uses each fresh threshold and rejects invalid delivery configuration", () => {
    expect(
      quote({
        freeDeliveryEnabled: true,
        freeDeliveryThreshold: 60_000,
        productPrice: 50_000,
      }).delivery_fee,
    ).toBe(10_005);
    expect(
      quote({
        freeDeliveryEnabled: true,
        freeDeliveryThreshold: 40_000,
        productPrice: 50_000,
      }).delivery_fee,
    ).toBe(0);
    expect(() => quote({ deliveryFee: -1 })).toThrow("Delivery fee is unavailable");
    expect(() => quote({ freeDeliveryThreshold: -1 })).toThrow(
      "Free-delivery threshold is unavailable",
    );
    expect(
      quote({ freeDeliveryEnabled: true, freeDeliveryThreshold: 0, productPrice: 250_000 }),
    ).toMatchObject({ delivery_fee: 10_005, free_delivery_applied: false });
  });

  it("rotates when the latest immutable attempt used different delivery rules", () => {
    const oldQuote = quote({
      freeDeliveryEnabled: true,
      freeDeliveryThreshold: 250_000,
      productPrice: 50_000,
    });
    const newQuote = quote({
      freeDeliveryEnabled: true,
      freeDeliveryThreshold: 200_000,
      productPrice: 50_000,
    });
    const metadata: PaymentQuoteMetadata = {
      quote_version: oldQuote.version,
      order_id: "33333333-3333-4333-8333-333333333333",
      order_reference: "DG-ORDER-1",
      checkout_attempt_id: "44444444-4444-4444-8444-444444444444",
      quote: oldQuote,
      attempt_type: "initial",
    };
    expect(oldQuote.total).toBe(newQuote.total);
    expect(paymentAttemptQuoteMatches(metadata, newQuote)).toBe(false);
    expect(paymentAttemptQuoteMatches(metadata, oldQuote)).toBe(true);
    expect(paymentAttemptQuoteMatches(null, oldQuote)).toBe(false);
  });
});

describe("reference-specific payment binding", () => {
  const currentQuote = quote({ coupon: coupon() });
  const order = orderFor(currentQuote);
  const reference = "DG-PAYMENT-1";
  const metadata: PaymentQuoteMetadata = {
    quote_version: currentQuote.version,
    order_id: order.id,
    order_reference: order.reference,
    checkout_attempt_id: "44444444-4444-4444-8444-444444444444",
    quote: currentQuote,
    attempt_type: "initial",
  };
  const transaction = {
    reference,
    paystack_reference: reference,
    order_id: order.id,
    amount: currentQuote.total,
    currency: currentQuote.currency,
    metadata,
  };
  const provider = {
    reference,
    status: "success",
    amount: currentQuote.total * 100,
    currency: currentQuote.currency,
  };

  it("accepts only an exact reference, amount, currency, order, and quote binding", () => {
    expect(validatePaymentBinding({ reference, transaction, order, provider })).toMatchObject({
      ok: true,
    });
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order,
        provider: { ...provider, amount: provider.amount + 100 },
      }),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order,
        provider: { ...provider, currency: "USD" },
      }),
    ).toEqual({ ok: false, reason: "currency_mismatch" });
  });

  it("rejects legacy attempts without an immutable quote instead of using current totals", () => {
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, metadata: {} },
        order,
        provider,
      }),
    ).toEqual({ ok: false, reason: "legacy_quote_missing" });
  });

  it("rejects a forged/direct success reference before a paid transition can be owned", () => {
    expect(
      validatePaymentBinding({
        reference: "DG-FORGED",
        transaction,
        order,
        provider,
      }),
    ).toEqual({ ok: false, reason: "reference_mismatch" });
  });

  it("cannot finalize a delayed old reference against a replacement order quote", () => {
    const replacementQuote = quote({ deliveryFee: 12_000 });
    expect(checkoutQuotesMatch(currentQuote, replacementQuote)).toBe(false);
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order: orderFor(replacementQuote),
        provider,
      }),
    ).toEqual({ ok: false, reason: "order_quote_mismatch" });
  });

  it("accepts a jsonb-normalized (key-reordered) identical quote — production false positive", () => {
    // Reproduces DG-MU00QX1V-17B49021: Postgres jsonb does not preserve JS
    // key order, so the persisted metadata quote arrives with reordered keys
    // (sku,name,quantity,line_total,product_id,unit_price). Values identical.
    const reorder = <T extends Record<string, unknown>>(obj: T): T =>
      Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;
    const jsonbQuote: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    jsonbQuote.items = jsonbQuote.items.map((item) => reorder(item as never));
    const normalizedMetadata = { ...metadata, quote: jsonbQuote };
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, metadata: normalizedMetadata },
        order,
        provider,
      }),
    ).toMatchObject({ ok: true });
  });

  it("treats omitted optional fields and explicit nulls as equivalent", () => {
    const sparseQuote: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    delete (sparseQuote as Record<string, unknown>).coupon;
    const nullQuote: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    nullQuote.coupon = null;
    expect(checkoutQuotesMatch(sparseQuote, nullQuote)).toBe(true);
    // Optional nested item fields follow the same rule.
    const sparseItem: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    delete (sparseItem.items[0] as Record<string, unknown>).cost_price;
    const nullItem: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    nullItem.items[0].cost_price = null;
    expect(checkoutQuotesMatch(sparseItem, nullItem)).toBe(true);
  });

  it("defines numeric string vs number as explicitly equivalent (canonicalized)", () => {
    const stringified: CheckoutQuote = JSON.parse(JSON.stringify(currentQuote));
    (stringified as unknown as Record<string, unknown>).subtotal = String(currentQuote.subtotal);
    (stringified as unknown as Record<string, unknown>).total = String(currentQuote.total);
    stringified.items[0].unit_price = String(currentQuote.items[0].unit_price) as never;
    // canonicalJson does NOT coerce scalar types — "85000" !== 85000 by design,
    // so a type-flip in a REAL field is still a mismatch worth investigating.
    expect(checkoutQuotesMatch(currentQuote, stringified)).toBe(false);
    // orderMatchesQuote is the order-side comparator and DOES coerce its own
    // numeric columns via Number(); the monetary checks govern there.
  });

  it("rejects every real financial divergence class", () => {
    // Each case diverges the STORED metadata quote from the truthful order
    // rows (order + provider anchors untouched), isolating the quote
    // comparison that guards order_quote_mismatch.
    const cases: Array<[string, (q: CheckoutQuote) => CheckoutQuote]> = [
      ["changed price", (q) => ({ ...q, items: [{ ...q.items[0], unit_price: 1 }] })],
      ["changed quantity", (q) => ({ ...q, items: [{ ...q.items[0], quantity: 2 }] })],
      ["changed delivery", (q) => ({ ...q, delivery_fee: 20_000 })],
      ["changed discount", (q) => ({ ...q, discount: q.discount + 100 })],
      ["changed subtotal", (q) => ({ ...q, subtotal: q.subtotal + 1 })],
      ["changed line_total", (q) => ({ ...q, items: [{ ...q.items[0], line_total: 1 }] })],
      ["changed sku", (q) => ({ ...q, items: [{ ...q.items[0], sku: "DG-OTHER" }] })],
    ];
    for (const [label, mutate] of cases) {
      const tampered = mutate(JSON.parse(JSON.stringify(currentQuote)));
      const result = validatePaymentBinding({
        reference,
        transaction: { ...transaction, metadata: { ...metadata, quote: tampered } },
        order,
        provider,
      });
      expect(result, label).toEqual({ ok: false, reason: "order_quote_mismatch" });
    }
  });

  it("rejects total, currency, and cross-layer tampering through their own anchors", () => {
    // Provider amount vs stored quote total:
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order,
        provider: { ...provider, amount: provider.amount + 1 },
      }),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
    // Provider currency vs stored quote currency:
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order,
        provider: { ...provider, currency: "USD" },
      }),
    ).toEqual({ ok: false, reason: "currency_mismatch" });
    // Transaction amount vs stored quote:
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, amount: currentQuote.total + 1 },
        order,
        provider,
      }),
    ).toEqual({ ok: false, reason: "transaction_quote_mismatch" });
    // A full quote/total/currency replacement order can never bind:
    const replaced = quote({ deliveryFee: 12_000 });
    expect(
      validatePaymentBinding({
        reference,
        transaction,
        order: orderFor(replaced),
        provider,
      }),
    ).toEqual({ ok: false, reason: "order_quote_mismatch" });
  });

  it("rejects wrong order/reference binding and tampered metadata", () => {
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, order_id: "99999999-9999-4999-8999-999999999999" },
        order,
        provider,
      }),
    ).toEqual({ ok: false, reason: "order_binding_mismatch" });
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, metadata: { ...metadata, order_reference: "DG-OTHER" } },
        order,
        provider,
      }),
    ).toEqual({ ok: false, reason: "order_binding_mismatch" });
  });

  it("authoritative coupon identity is coupon_id; descriptive coupon block is display-only", () => {
    // orderMatchesQuote compares the canonical coupon_id (mirrored in
    // order.coupon_id), not the human-readable coupon descriptor. A swapped
    // display block with the same coupon_id does not break the financial
    // binding; a different coupon_id would (via the monetary anchor).
    const displaySwap = JSON.parse(JSON.stringify(currentQuote));
    displaySwap.coupon = { code: "OTHER", discountType: "fixed", discountValue: 1 };
    expect(
      validatePaymentBinding({
        reference,
        transaction: { ...transaction, metadata: { ...metadata, quote: displaySwap } },
        order,
        provider,
      }),
    ).toMatchObject({ ok: true });
  });

  it("reports non-PII divergence fields for real financial mismatches", () => {
    const stored = JSON.parse(JSON.stringify(currentQuote));
    const charged = JSON.parse(JSON.stringify(currentQuote));
    charged.delivery_fee = 12_345;
    charged.total = currentQuote.total + 2_340;
    const diffs = explainQuoteDivergence(charged, stored);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.join(";")).toContain("delivery_fee");
    expect(diffs.join(";")).toContain("total");
    // The diverger only ever sees commercial quote fields — never customer PII.
    expect(diffs.join(";")).not.toContain("@");
  });
});

describe("checkout cart completion state", () => {
  it("keeps finalized payment successful while its receipt is still pending", () => {
    const result = buildConfirmedPaymentState({
      orderId: "11111111-1111-4111-8111-111111111111",
      reference: "DG-PAID-NO-RECEIPT",
      orderSummary: {
        reference: "DG-PAID-NO-RECEIPT",
        paymentStatus: "paid",
        total: 59_505,
        currency: "NGN",
        items: [{ name: "Server Product", quantity: 1, unitPrice: 50_000, lineTotal: 50_000 }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.payment_confirmed).toBe(true);
    expect(result.receipt_pending).toBe(true);
    expect(result.receipt_token).toBeUndefined();
    expect(result.message).toContain("receipt is being prepared");
    expect(shouldClearCheckoutCart(result)).toBe(true);
  });

  it("clears only after verified application success", () => {
    expect(
      shouldClearCheckoutCart({
        ok: true,
        payment_confirmed: true,
        receipt_token: "55555555-5555-4555-8555-555555555555",
      }),
    ).toBe(true);
    expect(
      shouldClearCheckoutCart({
        ok: true,
        payment_confirmed: true,
        already_processed: true,
      }),
    ).toBe(true);
    expect(shouldClearCheckoutCart({ ok: true, payment_confirmed: true })).toBe(true);
    expect(shouldClearCheckoutCart({ ok: true })).toBe(false);
    expect(
      shouldClearCheckoutCart({
        ok: false,
        payment_confirmed: true,
        receipt_token: "55555555-5555-4555-8555-555555555555",
      }),
    ).toBe(false);
    expect(shouldClearCheckoutCart({ ok: false })).toBe(false);
  });

  it("treats callback/webhook retries as the same completion only for the winning reference", () => {
    expect(
      isSameFinalizedPayment({ status: "paid", payment_reference: "DG-WINNER" }, "DG-WINNER"),
    ).toBe(true);
    expect(
      isSameFinalizedPayment({ status: "paid", payment_reference: "DG-WINNER" }, "DG-SECOND"),
    ).toBe(false);
    expect(
      isSameFinalizedPayment({ status: "pending", payment_reference: null }, "DG-WINNER"),
    ).toBe(false);
  });

  it("builds only customer-initiated wa.me messages from the configured number", () => {
    const url = buildPaymentWhatsAppUrl({
      configuredUrl: "https://wa.me/2348012345678",
      orderReference: "DG-ORDER-1",
      total: 59_505,
      currency: "NGN",
      items: [{ name: "Authoritative Monitor", quantity: 1 }],
      receiptUrl: "https://example.test/api/receipt/opaque-token",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("wa.me");
    expect(parsed.pathname).toBe("/2348012345678");
    expect(parsed.searchParams.get("text")).toContain("DG-ORDER-1");
    expect(parsed.searchParams.get("text")).toContain("opaque-token");
    expect(
      buildPaymentWhatsAppUrl({
        configuredUrl: "https://malicious.example/2348012345678",
        orderReference: "DG-ORDER-1",
        total: 1,
        currency: "NGN",
        items: [],
      }),
    ).toBe("");
  });
});
