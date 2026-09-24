// Server functions exported for the TanStack Start RPC bridge.
import { checkRateLimit } from "./rate-limit.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildCheckoutQuote,
  buildExistingCustomerPatch,
  buildOrderItemSnapshotRows,
  buildOrderShippingSnapshot,
  canReuseCheckoutOrder,
  paymentAttemptQuoteMatches,
  orderMatchesQuote,
  parseCustomerName,
  type CheckoutItemInput,
  type CheckoutProductRow,
  type CheckoutQuote,
  type PaymentQuoteMetadata,
  FINANCIAL_FINALIZATION_VERSION,
} from "./checkout-quote";
import { normalizeCouponCode, type CouponRow } from "./coupon-lifecycle";
import { CheckoutProductQueryError, loadCheckoutProductRows } from "./checkout-products.server";

const checkoutItemsSchema = z
  .array(
    z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
      .strict(),
  )
  .min(1)
  .max(50);

const shippingAddressSchema = z
  .object({
    state: z.string().trim().min(1).max(100),
    lga: z.string().trim().min(1).max(100),
    city: z.string().trim().max(100).optional(),
    address: z.string().trim().min(5).max(240),
  })
  .strict();

export const checkoutInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .regex(/^\+[1-9]\d{6,14}$/),
    fullName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .refine(
        (value) => !value || /^[\p{L}\p{M}\s\u0027\u2019\u02BC.\-\u2010\u2013]+$/u.test(value),
        "Name can only contain letters, spaces, apostrophes, hyphens, or periods",
      )
      .refine((value) => !value || !/\d/.test(value), "Name cannot contain numbers"),
    checkoutAttemptId: z.string().uuid(),
    items: checkoutItemsSchema,
    shippingAddress: shippingAddressSchema,
    couponCode: z
      .string()
      .trim()
      .max(50)
      .regex(/^[A-Za-z0-9]+$/)
      .optional(),
  })
  .strict();

type DatabaseClient = ReturnType<typeof import("./database.server").createDatabaseClient>;

async function loadAuthoritativeQuote(
  db: DatabaseClient,
  items: CheckoutItemInput[],
  couponCode?: string,
): Promise<{ quote: CheckoutQuote; couponRow: CouponRow | null }> {
  const productIds = items.map((item) => item.productId);
  let products: CheckoutProductRow[];
  try {
    products = await loadCheckoutProductRows((selection) =>
      db.from("products").select(selection).in("id", productIds),
    );
  } catch (error) {
    console.error("checkout_quote_product_query_failed", {
      code: error instanceof CheckoutProductQueryError ? error.databaseCode : "unknown",
    });
    throw new Error("Products could not be verified. Please retry.");
  }

  let coupon: CouponRow | null = null;
  const normalizedCoupon = couponCode ? normalizeCouponCode(couponCode) : "";
  if (normalizedCoupon) {
    const result = await db
      .from("coupons")
      .select(
        "id, code, discount_type, discount_value, max_uses, uses, starts_at, expires_at, active",
      )
      .eq("code", normalizedCoupon)
      .maybeSingle();
    if (result.error) throw new Error("Coupons are temporarily unavailable.");
    coupon = result.data as CouponRow | null;
  }

  const settingsResult = await db
    .from("site_settings")
    .select("key, value")
    .in("key", ["delivery_fee", "free_delivery_enabled", "free_delivery_threshold"]);
  if (settingsResult.error) throw new Error("Delivery pricing is temporarily unavailable.");
  const settings = Object.fromEntries(
    (settingsResult.data ?? []).map((row: { key: string; value: string }) => [row.key, row.value]),
  );
  const deliveryFee =
    settings.delivery_fee === undefined ? Number.NaN : Number(settings.delivery_fee);
  const freeDeliveryEnabled = settings.free_delivery_enabled === "true";
  const freeDeliveryThreshold =
    settings.free_delivery_threshold === undefined ? 0 : Number(settings.free_delivery_threshold);

  return {
    quote: buildCheckoutQuote({
      items,
      products,
      coupon,
      couponRequested: Boolean(normalizedCoupon),
      deliveryFee,
      freeDeliveryEnabled,
      freeDeliveryThreshold,
    }),
    couponRow: coupon,
  };
}

function publicQuote(quote: CheckoutQuote) {
  return {
    ...quote,
    items: quote.items.map(({ cost_price: _costPrice, ...item }) => item),
  };
}

/** Server-authoritative quote used by the checkout display. */
export const getCheckoutQuote = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        items: checkoutItemsSchema,
        couponCode: z
          .string()
          .trim()
          .max(50)
          .regex(/^[A-Za-z0-9]+$/)
          .optional(),
      })
      .strict(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient } = await import("./database.server");
    const { quote } = await loadAuthoritativeQuote(
      createDatabaseClient(),
      data.items,
      data.couponCode,
    );
    return { quote: publicQuote(quote) };
  });

/** Coupon preview using the same product, coupon, and delivery quote as payment initialization. */
export const validateCoupon = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .regex(/^[A-Za-z0-9]+$/),
        items: checkoutItemsSchema,
      })
      .strict(),
  )
  .handler(async ({ data }) => {
    try {
      const { createDatabaseClient } = await import("./database.server");
      const { quote } = await loadAuthoritativeQuote(createDatabaseClient(), data.items, data.code);
      if (!quote.coupon) return { valid: false as const, message: "Coupon code not found." };
      return {
        valid: true as const,
        couponId: quote.coupon_id!,
        code: quote.coupon.code,
        discountType: quote.coupon.discountType,
        discountValue: quote.coupon.discountValue,
        discount: quote.discount,
        quote: publicQuote(quote),
      };
    } catch (error) {
      return {
        valid: false as const,
        message: error instanceof Error ? error.message : "Coupon could not be verified.",
      };
    }
  });

function createReference(): string {
  return `DG-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createPaymentAttempt(input: {
  db: DatabaseClient;
  order: { id: string; reference: string };
  quote: CheckoutQuote;
  email: string;
  checkoutAttemptId: string;
  attemptType: "initial" | "retry";
  /** Present only when the reservation gate secured a slot (flag-on flow). */
  couponReservation?: { reservationId: string | null };
}) {
  const reference = input.attemptType === "initial" ? input.order.reference : createReference();
  const immutableQuote = publicQuote(input.quote) as CheckoutQuote;
  const reservationActive = Boolean(input.couponReservation);
  const metadata: PaymentQuoteMetadata = {
    quote_version: input.quote.version,
    order_id: input.order.id,
    order_reference: input.order.reference,
    checkout_attempt_id: input.checkoutAttemptId,
    quote: immutableQuote,
    attempt_type: input.attemptType,
    // v1 rollout creation gate (same 3 lines as payment-rollout.server.ts,
    // inlined because dev import-protection denies ANY .server-marked import
    // from this client-reachable RPC-bridge module). Creation gate only:
    // existing v1 attempts never fall back to legacy writes.
    ...(process.env.PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED === "true"
      ? { financial_finalization_version: FINANCIAL_FINALIZATION_VERSION }
      : {}),
    // Reservation-aware flow: stamp the v2 marker server-side, immutably,
    // BEFORE the Paystack redirect. Spread LAST so it wins over the v1
    // rollout gate — a reserved checkout is unambiguously a v2 payment. The
    // finalizer reads THIS marker — never the executing deployment's flag —
    // so the payment's protocol is sticky across deployments.
    ...(reservationActive
      ? {
          financial_finalization_version: 2,
          ...(input.couponReservation?.reservationId
            ? { reservation_id: input.couponReservation.reservationId }
            : {}),
        }
      : {}),
  };
  const { createTransaction, updateTransaction } = await import("./admin/payments.server");
  const transaction = await createTransaction({
    order_id: input.order.id,
    reference,
    paystack_reference: reference,
    amount: input.quote.total,
    currency: input.quote.currency,
    status: "initiated",
    metadata,
  });

  try {
    const { initializeTransaction } = await import("./paystack.server");
    const { getPaystackCallbackUrl } = await import("./site-origin.server");
    const paystack = await initializeTransaction({
      email: input.email,
      amount: input.quote.total,
      reference,
      callback_url: getPaystackCallbackUrl(),
      metadata: {
        quote_version: metadata.quote_version,
        order_id: metadata.order_id,
        order_reference: metadata.order_reference,
        checkout_attempt_id: metadata.checkout_attempt_id,
        attempt_type: metadata.attempt_type,
      },
    });
    await updateTransaction(transaction.id, {
      status: "pending",
      paystack_reference: paystack.data.reference,
    });
    return { reference, authorizationUrl: paystack.data.authorization_url };
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
      gateway_response: "Payment initialization failed",
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * Create an immutable order quote and initialize a reference-specific Paystack attempt.
 * Browser names/prices/totals are rejected by the strict validator and never enter the snapshot.
 */
export const initializeCheckout = createServerFn({ method: "POST" })
  .validator(checkoutInputSchema)
  .handler(async ({ data }) => {
    const { isPaystackConfigured } = await import("./paystack.server");
    if (!isPaystackConfigured()) throw new Error("Payment is temporarily unavailable.");
    // Anonymous write: bound payment-initiation attempts per email+IP.
    // Quote amounts remain fully server-authoritative regardless.
    const rl = await checkRateLimit("checkout", data.email);
    if (rl.configured && !rl.success) {
      throw new Error("Too many payment attempts. Please wait a few minutes and try again.");
    }
    const { createDatabaseClient } = await import("./database.server");
    const db = createDatabaseClient();
    const { quote, couponRow } = await loadAuthoritativeQuote(db, data.items, data.couponCode);
    // Normalize to canonical E.164: the schema regex accepts +2340803... (stray
    // leading 0 after the country code) which must never reach customer records.
    const { parsePhoneNumberFromString } = await import("libphonenumber-js");
    const parsedPhone = parsePhoneNumberFromString(data.phone);
    const canonicalPhone = parsedPhone?.number ?? data.phone;
    const shippingSnapshot = buildOrderShippingSnapshot(data.shippingAddress, {
      fullName: data.fullName,
      phone: canonicalPhone,
    });

    // ---- Reservation gate (COUPON_RESERVATIONS_V1) --------------------------
    // Flag ON + limited coupon: atomically reserve one use BEFORE Paystack.
    // FAIL-CLOSED: any reservation failure stops initialization — never fall
    // back to a discounted v1 checkout (that would recreate the race).
    // Flag OFF: byte-identical legacy behaviour (no reservation, no marker).
    let couponReservation: { reservationId: string | null } | null = null;
    const { COUPON_RESERVATIONS_ENABLED, reserveCouponForCheckout } =
      await import("./payment-finalizer-selector.server");
    if (COUPON_RESERVATIONS_ENABLED && couponRow) {
      try {
        couponReservation = await reserveCouponForCheckout({
          db,
          coupon: { code: couponRow.code, maxUses: couponRow.max_uses },
          checkoutAttemptId: data.checkoutAttemptId,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "CouponUnavailableError") {
          throw new Error("Coupon is no longer available.");
        }
        throw new Error(
          "We couldn't secure your coupon just now. Your details are saved — please retry payment in a moment.",
        );
      }
    }

    const existingResult = await db
      .from("orders")
      .select(
        "id, reference, status, email, checkout_attempt_id, created_at, shipping_address, subtotal, discount, delivery_fee, total, currency, coupon_id, order_items(product_id, sku, name, quantity, unit_price, line_total)",
      )
      .eq("checkout_attempt_id", data.checkoutAttemptId)
      .maybeSingle();
    if (existingResult.error)
      throw new Error("Checkout history could not be verified. Please retry.");
    const existingOrder = existingResult.data;
    let canReuse = Boolean(
      existingOrder &&
      canReuseCheckoutOrder(existingOrder, quote, {
        email: data.email,
        shippingAddress: shippingSnapshot,
      }),
    );
    if (canReuse && existingOrder) {
      const latestPaymentResult = await db
        .from("payment_transactions")
        .select("metadata")
        .eq("order_id", existingOrder.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestPaymentResult.error) {
        throw new Error("Checkout history could not be verified. Please retry.");
      }
      canReuse = paymentAttemptQuoteMatches(
        latestPaymentResult.data?.metadata as Partial<PaymentQuoteMetadata> | null,
        quote,
      );
    }

    if (canReuse && existingOrder) {
      const attempt = await createPaymentAttempt({
        db,
        order: existingOrder,
        quote,
        email: data.email,
        checkoutAttemptId: data.checkoutAttemptId,
        attemptType: "retry",
        ...(couponReservation ? { couponReservation } : {}),
      });
      return {
        authorization_url: attempt.authorizationUrl,
        reference: attempt.reference,
        order_reference: existingOrder.reference,
        checkout_attempt_id: data.checkoutAttemptId,
        quote: publicQuote(quote),
        reused: true,
      };
    }

    // A stale/incompatible browser attempt ID receives a fresh server identity.
    const effectiveAttemptId = existingOrder ? crypto.randomUUID() : data.checkoutAttemptId;
    const { data: existingCustomer, error: customerLookupError } = await db
      .from("customers")
      .select("id, first_name, phone")
      .eq("email", data.email)
      .maybeSingle();
    if (customerLookupError)
      throw new Error("Customer details could not be verified. Please retry.");
    let customerId = existingCustomer?.id;
    const { firstName, lastName } = parseCustomerName(data.fullName);
    if (!customerId) {
      const created = await db
        .from("customers")
        .insert({
          email: data.email,
          first_name: firstName,
          last_name: lastName,
          phone: canonicalPhone,
        })
        .select("id")
        .single();
      if (created.error || !created.data) throw new Error("Customer details could not be saved.");
      customerId = created.data.id;
    } else {
      const customerPatch = buildExistingCustomerPatch(
        existingCustomer ?? {},
        data.fullName,
        canonicalPhone,
      );
      if (Object.keys(customerPatch).length > 0) {
        const updated = await db.from("customers").update(customerPatch).eq("id", customerId);
        if (updated.error) throw new Error("Customer details could not be saved.");
      }
    }

    const orderReference = createReference();
    const orderResult = await db
      .from("orders")
      .insert({
        reference: orderReference,
        customer_id: customerId,
        email: data.email,
        status: "pending",
        checkout_attempt_id: effectiveAttemptId,
        subtotal: quote.subtotal,
        discount: quote.discount,
        delivery_fee: quote.delivery_fee,
        total: quote.total,
        currency: quote.currency,
        idempotency_key: crypto.randomUUID(),
        shipping_address: shippingSnapshot,
        coupon_id: quote.coupon_id,
      })
      .select("id, reference")
      .single();
    if (orderResult.error || !orderResult.data) throw new Error("Order could not be created.");
    const order = orderResult.data;

    const itemResult = await db
      .from("order_items")
      .insert(buildOrderItemSnapshotRows(order.id, quote.items));
    if (itemResult.error) throw new Error("Order items could not be saved.");

    const attempt = await createPaymentAttempt({
      db,
      order,
      quote,
      email: data.email,
      checkoutAttemptId: effectiveAttemptId,
      attemptType: "initial",
      ...(couponReservation ? { couponReservation } : {}),
    });

    if (existingOrder) {
      await db
        .from("orders")
        .update({ status: "abandoned" })
        .eq("id", existingOrder.id)
        .eq("status", "pending");
    }

    try {
      const { sendAdminAlert } = await import("./telegram.server");
      const { buildOrderAlert } = await import("./telegram/formatters/lead");
      await sendAdminAlert(
        "New Order",
        buildOrderAlert({
          orderNumber: order.reference,
          customerName: firstName || "Customer",
          total: quote.total,
          status: "pending",
          createdAt: new Date(),
        }),
      );
    } catch {
      // Operational alerts are best-effort and do not change checkout state.
    }

    return {
      authorization_url: attempt.authorizationUrl,
      reference: attempt.reference,
      order_reference: order.reference,
      checkout_attempt_id: effectiveAttemptId,
      quote: publicQuote(quote),
      reused: false,
    };
  });
