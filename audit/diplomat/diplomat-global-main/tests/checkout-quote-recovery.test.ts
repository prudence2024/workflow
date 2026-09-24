import { describe, expect, it, vi } from "vitest";
import { checkoutInputSchema } from "../src/lib/checkout.server";
import {
  buildCheckoutQuote,
  buildOrderItemSnapshotRows,
  type CheckoutProductRow,
} from "../src/lib/checkout-quote";
import {
  CHECKOUT_PRODUCT_SELECT_BASE,
  CHECKOUT_PRODUCT_SELECT_WITH_COST,
  CheckoutProductQueryError,
  loadCheckoutProductRows,
} from "../src/lib/checkout-products.server";
import {
  CART_STORAGE_VERSION,
  parseStoredCart,
  parseStoredCartState,
  serializeStoredCart,
  toCheckoutItems,
} from "../src/lib/cart-storage";
import {
  canSubmitCheckout,
  quoteAmountLabel,
  runCheckoutQuoteRequest,
} from "../src/lib/checkout-ui-state";

// Controlled fixture based on earlier runtime evidence; never a fresh live DB read.
const product: CheckoutProductRow = {
  id: "9724fa3e-6ea3-4d36-87cf-7e0b775abbca",
  sku: "DG-MON-ZP15",
  name: "Zenith Pro Portable Monitor",
  price: 50_000,
  status: "active",
  inventory: { quantity: 20, reserved: 0 },
};

function build(products: CheckoutProductRow[] = [product]) {
  return buildCheckoutQuote({
    items: [{ productId: product.id, quantity: 1 }],
    products,
    coupon: null,
    couponRequested: false,
    deliveryFee: 10_005,
    freeDeliveryEnabled: false,
    freeDeliveryThreshold: 200_000,
  });
}

describe("authoritative checkout quote recovery", () => {
  it("uses the controlled authoritative product fixture identity, inventory, and price", () => {
    expect(build()).toMatchObject({
      subtotal: 50_000,
      delivery_fee: 10_005,
      total: 60_005,
      items: [
        {
          product_id: product.id,
          sku: "DG-MON-ZP15",
          name: "Zenith Pro Portable Monitor",
          unit_price: 50_000,
          quantity: 1,
        },
      ],
    });
  });

  it("does not require the absent order_items cost column when cost is unknown", () => {
    const [row] = buildOrderItemSnapshotRows("order-id", build().items);
    expect(row).not.toHaveProperty("cost_price");
    expect(row).toMatchObject({
      order_id: "order-id",
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      unit_price: 50_000,
      line_total: 50_000,
    });
  });

  it("falls back safely when the Owner-gated cost column is not yet available", async () => {
    const query = vi.fn(async (selection: string) =>
      selection === CHECKOUT_PRODUCT_SELECT_WITH_COST
        ? {
            data: null,
            error: { code: "42703", message: "column products.cost_price does not exist" },
          }
        : { data: [product], error: null },
    );
    const rows = await loadCheckoutProductRows(query);
    expect(query).toHaveBeenNthCalledWith(1, CHECKOUT_PRODUCT_SELECT_WITH_COST);
    expect(query).toHaveBeenNthCalledWith(2, CHECKOUT_PRODUCT_SELECT_BASE);
    expect(rows).toEqual([{ ...product, cost_price: null }]);
  });

  it("retains a real cost snapshot when both Migration-A columns are available", async () => {
    const rows = await loadCheckoutProductRows(async () => ({
      data: [{ ...product, cost_price: 30_000 }],
      error: null,
    }));
    expect(rows[0].cost_price).toBe(30_000);
    expect(build(rows).items[0].cost_price).toBe(30_000);
    expect(buildOrderItemSnapshotRows("order-id", build(rows).items)[0]).toHaveProperty(
      "cost_price",
      30_000,
    );
  });

  it("preserves a real DB failure classification instead of treating it as no products", async () => {
    await expect(
      loadCheckoutProductRows(async () => ({
        data: null,
        error: { code: "08006", message: "connection failure" },
      })),
    ).rejects.toMatchObject<Partial<CheckoutProductQueryError>>({
      name: "CheckoutProductQueryError",
      databaseCode: "08006",
    });
  });

  it("does not disguise an unrelated missing-column error as optional cost compatibility", async () => {
    const query = vi.fn(async () => ({
      data: null,
      error: { code: "42703", message: "column products.status does not exist" },
    }));
    await expect(loadCheckoutProductRows(query)).rejects.toMatchObject({
      databaseCode: "42703",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("normalizes legacy cart identity/quantity and strips display fields from quote input", () => {
    const legacy = JSON.stringify([
      {
        product_id: product.id,
        quantity: "1",
        name: "Browser name",
        price: 1,
        sku: "BROWSER-SKU",
        slug: "browser-slug",
      },
    ]);
    const cart = parseStoredCart(legacy);
    expect(cart).toEqual([{ productId: product.id, quantity: 1 }]);
    expect(toCheckoutItems(cart)).toEqual([{ productId: product.id, quantity: 1 }]);
    expect(JSON.parse(serializeStoredCart(cart))).toEqual({
      version: CART_STORAGE_VERSION,
      items: cart,
    });
  });

  it("flags an unsafe legacy identifier instead of sending it to checkout", () => {
    expect(parseStoredCartState(JSON.stringify([{ productId: "1", quantity: 1 }]))).toEqual({
      items: [],
      invalidItemCount: 1,
    });
  });

  it("keeps the strict server boundary against browser product identity and money", () => {
    const result = checkoutInputSchema.safeParse({
      email: "buyer@example.com",
      phone: "+2348012345678",
      fullName: "Ada Buyer",
      checkoutAttemptId: "44444444-4444-4444-8444-444444444444",
      items: [
        {
          productId: product.id,
          quantity: 1,
          name: "Browser name",
          sku: "BROWSER-SKU",
          price: 1,
        },
      ],
      shippingAddress: {
        state: "Lagos",
        lga: "Ikeja",
        address: "1 Test Street",
      },
    });
    expect(result.success).toBe(false);
  });

  it("distinguishes unavailable, inactive, and out-of-stock products", () => {
    // Nothing purchasable remains → fail closed carrying the per-line message.
    expect(() => build([])).toThrow("no longer available");
    expect(() => build([{ ...product, status: "draft" }])).toThrow("is no longer available");
    expect(() => build([{ ...product, inventory: { quantity: 0, reserved: 0 } }])).toThrow(
      "is sold out",
    );
  });

  it("reports per-line reconciliation issues while partial stock stays purchasable", () => {
    // LOWER_STOCK: cart asks for 3, only 1 available → line reduced, issue reported.
    const reduced = buildCheckoutQuote({
      items: [{ productId: product.id, quantity: 3 }],
      products: [{ ...product, inventory: { quantity: 1, reserved: 0 } }],
      coupon: null,
      couponRequested: false,
      deliveryFee: 0,
      freeDeliveryEnabled: false,
      freeDeliveryThreshold: 0,
    });
    expect(reduced.items).toHaveLength(1);
    expect(reduced.items[0].quantity).toBe(1);
    expect(reduced.issues).toEqual([
      expect.objectContaining({ reason: "LOWER_STOCK", availableQuantity: 1 }),
    ]);
    expect(reduced.issues?.[0].message).toContain("only 1 unit available");

    // PRICE_CHANGED: cart snapshot believed ₦40,000, server says ₦50,000.
    const drifted = buildCheckoutQuote({
      items: [{ productId: product.id, quantity: 1, price: 40_000 } as never],
      products: [product],
      coupon: null,
      couponRequested: false,
      deliveryFee: 0,
      freeDeliveryEnabled: false,
      freeDeliveryThreshold: 0,
    });
    expect(drifted.items[0].unit_price).toBe(50_000);
    expect(drifted.issues?.[0]).toMatchObject({
      reason: "PRICE_CHANGED",
      currentPrice: 50_000,
    });
    expect(drifted.issues?.[0].message).toContain("changed from");

    // Clean quote carries no issues key at all (shape stability for existing UI).
    expect(build().issues).toBeUndefined();
  });

  it("terminates a failed request and a retry performs a new authoritative call", async () => {
    const states: string[] = [];
    const request = vi
      .fn<() => Promise<{ total: number }>>()
      .mockRejectedValueOnce(new Error("Products could not be verified. Please retry."))
      .mockResolvedValueOnce({ total: 60_005 });
    const run = () =>
      runCheckoutQuoteRequest({
        request,
        onStart: () => states.push("loading"),
        onSuccess: ({ total }) => states.push(`success:${total}`),
        onError: () => states.push("error"),
        onFinish: () => states.push("finished"),
      });
    await run();
    expect(states).toEqual(["loading", "error", "finished"]);
    expect(
      quoteAmountLabel({ loading: false, error: "failed", value: undefined, format: String }),
    ).toBe("Unavailable");
    expect(
      canSubmitCheckout({ cartSize: 1, hasQuote: false, loading: false, error: "failed" }),
    ).toBe(false);
    await run();
    expect(request).toHaveBeenCalledTimes(2);
    expect(states.slice(-3)).toEqual(["loading", "success:60005", "finished"]);
    expect(quoteAmountLabel({ loading: false, error: "", value: 60_005, format: String })).toBe(
      "60005",
    );
    expect(canSubmitCheckout({ cartSize: 1, hasQuote: true, loading: false, error: "" })).toBe(
      true,
    );
  });
});
