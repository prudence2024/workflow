import { evaluateCoupon, type CouponRow } from "./coupon-lifecycle";

export const CHECKOUT_QUOTE_VERSION = 2;
export const CHECKOUT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

export interface CheckoutProductRow {
  id: string;
  sku: string;
  name: string;
  price: number | string;
  status: string;
  cost_price?: number | string | null;
  inventory?:
    | { quantity: number; reserved?: number | null }
    | Array<{ quantity: number; reserved?: number | null }>
    | null;
}

export interface CheckoutQuoteLine {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  cost_price?: number | null;
  line_total: number;
}

/**
 * Per-line cart reconciliation reason (Owner requirement: the customer must see
 * WHAT is wrong with each persisted cart line, not a single generic failure).
 * Server is the only authority; the client renders these reasons verbatim.
 */
export type CartLineIssueReason =
  "PRICE_CHANGED" | "LOWER_STOCK" | "OUT_OF_STOCK" | "UNPUBLISHED" | "DELETED";

export interface CartLineIssue {
  productId: string;
  sku: string;
  name: string;
  reason: CartLineIssueReason;
  /** Human-readable, customer-safe explanation. */
  message: string;
  /** Current server price, when the line is still purchasable at a new price. */
  currentPrice?: number;
  /** Max purchasable quantity for stock issues (null when not stock-related). */
  availableQuantity?: number | null;
  /** Cart quantity the customer requested. */
  requestedQuantity: number;
}

export interface CheckoutQuote {
  version: typeof CHECKOUT_QUOTE_VERSION;
  currency: "NGN";
  items: CheckoutQuoteLine[];
  subtotal: number;
  discount: number;
  eligible_subtotal: number;
  standard_delivery_fee: number;
  delivery_fee: number;
  free_delivery_enabled: boolean;
  free_delivery_threshold: number;
  free_delivery_applied: boolean;
  amount_remaining_for_free_delivery: number | null;
  total: number;
  /** Per-line reconciliation feedback for stale persisted carts. */
  issues?: CartLineIssue[];
  coupon_id: string | null;
  coupon: null | {
    code: string;
    discountType: CouponRow["discount_type"];
    discountValue: number;
  };
}

export function buildOrderItemSnapshotRows(orderId: string, items: CheckoutQuoteLine[]) {
  return items.map((item) => ({
    order_id: orderId,
    product_id: item.product_id,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    ...(item.cost_price == null ? {} : { cost_price: item.cost_price }),
    line_total: item.line_total,
  }));
}

function toMinorUnits(value: number): number {
  return Math.round(value * 100);
}

function fromMinorUnits(value: number): number {
  return value / 100;
}

function money(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

/** Customer-safe naira display for reconciliation messages. */
function formatNairaDisplay(value: number): string {
  return "₦" + value.toLocaleString("en-NG");
}

function inventoryAvailable(relation: CheckoutProductRow["inventory"]): number | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  if (!row) return null;
  return Math.max(
    0,
    Math.trunc(Number(row.quantity)) - Math.max(0, Math.trunc(Number(row.reserved ?? 0))),
  );
}

export function buildCheckoutQuote(input: {
  items: CheckoutItemInput[];
  products: CheckoutProductRow[];
  coupon: CouponRow | null;
  couponRequested: boolean;
  deliveryFee: number;
  freeDeliveryEnabled: boolean;
  freeDeliveryThreshold: number;
  now?: Date;
}): CheckoutQuote {
  if (input.items.length === 0) throw new Error("Your cart is empty.");
  const productMap = new Map(input.products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const issues: CartLineIssue[] = [];
  const lines: CheckoutQuoteLine[] = [];
  const recordIssue = (issue: CartLineIssue) => {
    issues.push(issue);
  };
  for (const item of input.items) {
    if (seen.has(item.productId)) throw new Error("Duplicate cart items are not allowed.");
    seen.add(item.productId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error("Product quantity must be between 1 and 99.");
    }
    const product = productMap.get(item.productId);
    if (!product) {
      recordIssue({
        productId: item.productId,
        sku: "",
        name: item.productId,
        reason: "DELETED",
        message: "This item is no longer available and was removed from your total.",
        availableQuantity: null,
        requestedQuantity: item.quantity,
      });
      continue;
    }
    if (product.status !== "active") {
      recordIssue({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        reason: "UNPUBLISHED",
        message: `${product.name} is no longer available and was removed from your total.`,
        availableQuantity: null,
        requestedQuantity: item.quantity,
      });
      continue;
    }
    const unitPrice = Number(product.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("A product in your cart has an invalid price.");
    }
    const available = inventoryAvailable(product.inventory);
    if (available !== null && available < item.quantity) {
      if (available === 0) {
        recordIssue({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          reason: "OUT_OF_STOCK",
          message: `${product.name} is sold out and was removed from your total.`,
          availableQuantity: 0,
          requestedQuantity: item.quantity,
        });
      } else {
        recordIssue({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          reason: "LOWER_STOCK",
          message: `${product.name} now has only ${available} unit${available === 1 ? "" : "s"} available — your quantity was reduced.`,
          availableQuantity: available,
          requestedQuantity: item.quantity,
        });
      }
      // Partial fulfilment: keep the purchasable remainder on the quote.
      const fulfilQuantity = Math.max(0, available);
      if (fulfilQuantity > 0) {
        lines.push({
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          quantity: fulfilQuantity,
          unit_price: money(unitPrice),
          cost_price: product.cost_price == null ? null : money(Number(product.cost_price)),
          line_total: money(unitPrice * fulfilQuantity),
        });
      }
      continue;
    }
    // Price drift vs what the persisted cart believed (cart payload carries the
    // product snapshot the customer saw; server price is authoritative).
    const cartPrice = Number((item as { price?: unknown }).price);
    if (Number.isFinite(cartPrice) && cartPrice > 0 && money(cartPrice) !== money(unitPrice)) {
      recordIssue({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        reason: "PRICE_CHANGED",
        message: `The price of ${product.name} changed from ${formatNairaDisplay(money(cartPrice))} to ${formatNairaDisplay(money(unitPrice))}.`,
        currentPrice: money(unitPrice),
        availableQuantity: null,
        requestedQuantity: item.quantity,
      });
    }
    lines.push({
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      unit_price: money(unitPrice),
      cost_price: product.cost_price == null ? null : money(Number(product.cost_price)),
      line_total: money(unitPrice * item.quantity),
    });
  }
  if (issues.length > 0 && lines.length === 0) {
    // Nothing purchasable remains: fail closed with the first issue's message.
    throw new Error(issues[0].message);
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.line_total), 0);
  const subtotal = fromMinorUnits(subtotalMinor);
  const evaluated = evaluateCoupon(input.coupon, subtotal, input.now);
  if (input.couponRequested && !evaluated.valid) throw new Error(evaluated.message);
  const discountMinor = Math.min(
    subtotalMinor,
    toMinorUnits(evaluated.valid ? evaluated.discount : 0),
  );
  const discount = fromMinorUnits(discountMinor);
  if (!Number.isFinite(input.deliveryFee) || input.deliveryFee < 0)
    throw new Error("Delivery fee is unavailable.");
  if (!Number.isFinite(input.freeDeliveryThreshold) || input.freeDeliveryThreshold < 0) {
    throw new Error("Free-delivery threshold is unavailable.");
  }
  const deliveryFeeMinor = toMinorUnits(input.deliveryFee);
  const thresholdMinor = toMinorUnits(input.freeDeliveryThreshold);
  const eligibleSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const hasValidFreeDeliveryThreshold = input.freeDeliveryEnabled && thresholdMinor > 0;
  const freeDeliveryApplied =
    hasValidFreeDeliveryThreshold && eligibleSubtotalMinor >= thresholdMinor;
  const deliveryMinor = freeDeliveryApplied ? 0 : deliveryFeeMinor;
  const amountRemainingMinor = hasValidFreeDeliveryThreshold
    ? Math.max(0, thresholdMinor - eligibleSubtotalMinor)
    : null;

  return {
    version: CHECKOUT_QUOTE_VERSION,
    currency: "NGN",
    items: lines,
    subtotal,
    discount,
    eligible_subtotal: fromMinorUnits(eligibleSubtotalMinor),
    standard_delivery_fee: fromMinorUnits(deliveryFeeMinor),
    delivery_fee: fromMinorUnits(deliveryMinor),
    free_delivery_enabled: input.freeDeliveryEnabled,
    free_delivery_threshold: fromMinorUnits(thresholdMinor),
    free_delivery_applied: freeDeliveryApplied,
    amount_remaining_for_free_delivery:
      amountRemainingMinor === null ? null : fromMinorUnits(amountRemainingMinor),
    total: fromMinorUnits(eligibleSubtotalMinor + deliveryMinor),
    ...(issues.length > 0 ? { issues } : {}),
    coupon_id: evaluated.valid ? evaluated.couponId : null,
    coupon: evaluated.valid
      ? {
          code: evaluated.code,
          discountType: evaluated.discountType,
          discountValue: evaluated.discountValue,
        }
      : null,
  };
}

export interface CheckoutShippingAddress {
  state: string;
  lga: string;
  city?: string;
  address: string;
}

export function buildOrderShippingSnapshot(
  address: CheckoutShippingAddress,
  customer: { fullName?: string; phone: string },
) {
  const fullName = customer.fullName?.trim() || null;
  return {
    state: address.state,
    lga: address.lga,
    ...(address.city?.trim() ? { city: address.city.trim() } : {}),
    address: address.address,
    full_name: fullName,
    phone: customer.phone,
  };
}

/**
 * Deterministic JSON canonicalization for quote comparison.
 *
 * Quotes are persisted as Postgres jsonb, which does NOT preserve JavaScript
 * key order (jsonb reorders object keys), while in-memory quotes keep their
 * literal construction order. Comparing raw JSON.stringify strings therefore
 * conflates harmless key-order differences with real financial divergence —
 * the exact false positive that rejected a provider-successful payment with
 * `order_quote_mismatch` while every commercial value was identical.
 *
 * Canonicalization sorts object keys recursively and treats omitted keys,
 * explicit nulls, and undefined as the same "absent" state. It never coerces
 * scalar types (string "85000" ≠ number 85000 by design) and never ignores
 * fields: every financially meaningful value still participates.
 * Arrays keep their order (order-sensitive); item collections that are
 * semantically unordered are sorted by immutable product_id before compare.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((member) => canonicalJson(member) || '"null"').join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined && member !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
}

/**
 * Human-readable, non-PII divergence report between two quote-shaped
 * structures, for forensic telemetry only (Sentry extras). Values are
 * truncated; keys and types are always shown so a real financial mismatch is
 * immediately distinguishable from a serialization artifact.
 */
export function explainQuoteDivergence(
  left: unknown,
  right: unknown,
  path = "$",
  depth = 0,
): string[] {
  if (depth > 6) return [`${path}: max depth reached`];
  if (left === right) return [];
  if ((left === undefined && right === null) || (left === null && right === undefined)) {
    return [];
  }
  const isObject = (v: unknown) => typeof v === "object" && v !== null;
  if (!isObject(left) || !isObject(right)) {
    const shape = (v: unknown) =>
      v === undefined ? "omitted" : `${typeof v}:${String(JSON.stringify(v)).slice(0, 24)}`;
    return [`${path}: ${shape(left)} !== ${shape(right)}`];
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    return [`${path}: array-vs-object shape mismatch`];
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return [`${path}: item count ${left.length} !== ${right.length}`];
    }
    const diffs: string[] = [];
    for (let index = 0; index < left.length; index++) {
      diffs.push(
        ...explainQuoteDivergence(left[index], right[index], `${path}[${index}]`, depth + 1),
      );
    }
    return diffs;
  }
  const keys = new Set([
    ...Object.keys(left as Record<string, unknown>),
    ...Object.keys(right as Record<string, unknown>),
  ]);
  const diffs: string[] = [];
  for (const key of [...keys].sort()) {
    diffs.push(
      ...explainQuoteDivergence(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
        depth + 1,
      ),
    );
  }
  return diffs;
}

export function checkoutQuotesMatch(left: CheckoutQuote, right: CheckoutQuote): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function paymentAttemptQuoteMatches(
  metadata: Partial<PaymentQuoteMetadata> | null | undefined,
  quote: CheckoutQuote,
): boolean {
  return Boolean(
    metadata?.quote_version === CHECKOUT_QUOTE_VERSION &&
    metadata.quote &&
    checkoutQuotesMatch(metadata.quote, quote),
  );
}

export function isCheckoutAttemptFresh(createdAt: string, now = new Date()): boolean {
  const created = new Date(createdAt).getTime();
  const age = now.getTime() - created;
  return Number.isFinite(created) && age >= 0 && age <= CHECKOUT_ATTEMPT_TTL_MS;
}

export function canReuseCheckoutOrder(
  order: Parameters<typeof orderMatchesQuote>[0] & {
    status: string;
    email: string;
    created_at: string;
    shipping_address: unknown;
  },
  quote: CheckoutQuote,
  customer: { email: string; shippingAddress: unknown },
  now = new Date(),
): boolean {
  return (
    order.status === "pending" &&
    isCheckoutAttemptFresh(order.created_at, now) &&
    orderMatchesQuote(order, quote) &&
    order.email.toLowerCase() === customer.email.toLowerCase() &&
    canonicalJson(order.shipping_address) === canonicalJson(customer.shippingAddress)
  );
}

export function orderMatchesQuote(
  order: {
    subtotal: number | string;
    discount: number | string;
    delivery_fee: number | string;
    total: number | string;
    currency?: string | null;
    coupon_id?: string | null;
    order_items?: Array<{
      product_id: string | null;
      sku: string;
      name: string;
      quantity: number;
      unit_price: number | string;
      line_total: number | string;
    }>;
  },
  quote: CheckoutQuote,
): boolean {
  const monetaryMatch =
    Number(order.subtotal) === quote.subtotal &&
    Number(order.discount) === quote.discount &&
    Number(order.delivery_fee) === quote.delivery_fee &&
    Number(order.total) === quote.total &&
    (order.currency ?? "NGN") === quote.currency &&
    (order.coupon_id ?? null) === quote.coupon_id;
  if (!monetaryMatch || !order.order_items) return false;
  const items = order.order_items
    .map((item) => ({
      product_id: item.product_id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    }))
    .sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
  const quoteItems = quote.items
    .map(({ cost_price: _costPrice, ...item }) => item)
    .sort((a, b) => a.product_id.localeCompare(b.product_id));
  // Canonical compare: persisted metadata is jsonb (key order not preserved),
  // so raw stringify would reject financially identical quotes.
  return canonicalJson(items) === canonicalJson(quoteItems);
}

export interface PaymentQuoteMetadata {
  quote_version: number;
  order_id: string;
  order_reference: string;
  checkout_attempt_id: string;
  quote: CheckoutQuote;
  attempt_type: "initial" | "retry";
  /** Version-1 attempts own their financial effects through complete_verified_payment_v1. */
  financial_finalization_version?: number;
  /** Reservation binding captured at attempt creation (flag-on flow only). */
  reservation_id?: string;
}

// NOTE: metadata is jsonb — the v2 marker rides the SAME canonical key
// financial_finalization_version (value 2). See payment-rollout.server.ts for
// the v1 creation gate and payment-finalizer-selector.server.ts for the gate.

/** Approved durable financial-boundary protocol version. */
export const FINANCIAL_FINALIZATION_VERSION = 1;
/** Reservation-aware protocol version (complete_verified_payment_v2). */
export const FINANCIAL_FINALIZATION_VERSION_V2 = 2;

export function isFinancialFinalizationV1(metadata: unknown): boolean {
  return (
    (metadata as Partial<PaymentQuoteMetadata> | null)?.financial_finalization_version ===
    FINANCIAL_FINALIZATION_VERSION
  );
}

/** v2 marker on the transaction metadata (server-authored, sticky for the payment's life). */
export function isFinancialFinalizationV2(metadata: unknown): boolean {
  return (
    (metadata as Partial<PaymentQuoteMetadata> | null)?.financial_finalization_version ===
    FINANCIAL_FINALIZATION_VERSION_V2
  );
}

/**
 * Canonical finalizer selection: the PAYMENT's stored marker decides, never
 * the executing deployment's feature flag. Callback and webhook may run on
 * different deployments, so an environment-based choice would be unsafe.
 * Missing/legacy markers resolve to v1 (historical rows never change meaning).
 */
export function financialFinalizerRpc(metadata: unknown): string {
  return isFinancialFinalizationV2(metadata)
    ? "complete_verified_payment_v2"
    : "complete_verified_payment_v1";
}

export function parseCustomerName(fullName?: string): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
}

export function buildExistingCustomerPatch(
  existing: { first_name?: string | null; phone?: string | null },
  fullName: string | undefined,
  phone: string,
): { first_name?: string; last_name?: string; phone?: string } {
  const { firstName, lastName } = parseCustomerName(fullName);
  return {
    ...(firstName && !existing.first_name ? { first_name: firstName, last_name: lastName } : {}),
    ...(!existing.phone ? { phone } : {}),
  };
}

export function validatePaymentBinding(input: {
  reference: string;
  transaction: {
    reference: string;
    paystack_reference?: string | null;
    order_id?: string | null;
    amount: number | string;
    currency: string;
    metadata?: unknown;
  };
  order: Parameters<typeof orderMatchesQuote>[0] & { id: string; reference: string };
  provider: { reference?: string; amount?: number; currency?: string; status?: string };
}): { ok: true; quote: CheckoutQuote } | { ok: false; reason: string } {
  const { transaction, order, provider, reference } = input;
  if (transaction.reference !== reference && transaction.paystack_reference !== reference) {
    return { ok: false, reason: "reference_mismatch" };
  }
  if (provider.reference !== reference) return { ok: false, reason: "provider_reference_mismatch" };
  if (provider.status !== "success") return { ok: false, reason: "provider_not_successful" };
  const metadata = transaction.metadata as Partial<PaymentQuoteMetadata> | null;
  if (!metadata || metadata.quote_version !== CHECKOUT_QUOTE_VERSION || !metadata.quote) {
    return { ok: false, reason: "legacy_quote_missing" };
  }
  if (
    transaction.order_id !== order.id ||
    metadata.order_id !== order.id ||
    metadata.order_reference !== order.reference
  ) {
    return { ok: false, reason: "order_binding_mismatch" };
  }
  if (!orderMatchesQuote(order, metadata.quote))
    return { ok: false, reason: "order_quote_mismatch" };
  if (
    Number(transaction.amount) !== metadata.quote.total ||
    transaction.currency !== metadata.quote.currency
  ) {
    return { ok: false, reason: "transaction_quote_mismatch" };
  }
  if (provider.amount !== Math.round(metadata.quote.total * 100)) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if (provider.currency !== metadata.quote.currency)
    return { ok: false, reason: "currency_mismatch" };
  return { ok: true, quote: metadata.quote };
}

export function isSameFinalizedPayment(
  order: { status: string; payment_reference?: string | null } | null,
  reference: string,
): boolean {
  return Boolean(
    order &&
    ["paid", "processing", "shipped", "delivered"].includes(order.status) &&
    order.payment_reference === reference,
  );
}
