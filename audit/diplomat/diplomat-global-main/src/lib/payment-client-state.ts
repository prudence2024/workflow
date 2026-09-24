export interface PaymentSuccessOrderSummary {
  reference: string;
  paymentStatus: string;
  total: number;
  currency: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

/**
 * Financially truthful failure taxonomy for provider-verified payment
 * attempts. "declined" is reserved for a definitive provider rejection of
 * the payment attempt itself; every transport/verification/internal problem
 * is "failed" — never presented to the customer as a decline.
 */
export type PaymentFailureKind = "declined" | "failed";

/** Definitive Paystack attempt-level rejections (provider truth, not guesses). */
export const PROVIDER_DECLINED_STATUSES = new Set([
  "failed",
  "declined",
  "refunded", // provider reversed the attempt; money did not stay received
  "reversed",
  "blocked",
]);

/** Attempt stopped without success or definitive decline. */
export const PROVIDER_ABANDONED_STATUSES = new Set(["abandoned"]);

export function mapProviderFailureKind(providerStatus: string): PaymentFailureKind {
  return PROVIDER_DECLINED_STATUSES.has(providerStatus) ? "declined" : "failed";
}

export interface PaymentCompletionState {
  ok: boolean;
  payment_confirmed?: boolean;
  already_processed?: boolean;
  receipt_token?: string;
  receipt_pending?: boolean;
  order_summary?: PaymentSuccessOrderSummary;
  /** Present only when ok=false: how the attempt ended, per provider truth. */
  failure_kind?: PaymentFailureKind;
  provider_status?: string;
  provider_reason?: string;
}

export function buildConfirmedPaymentState(input: {
  orderId: string;
  reference: string;
  orderSummary: PaymentSuccessOrderSummary;
  receiptToken?: string;
  alreadyProcessed?: boolean;
}) {
  const receiptPending = !input.receiptToken;
  return {
    ok: true as const,
    payment_confirmed: true as const,
    order_id: input.orderId,
    reference: input.reference,
    message: receiptPending
      ? "Payment confirmed. Your receipt is being prepared."
      : input.alreadyProcessed
        ? "Payment already confirmed"
        : "Payment confirmed and order finalized",
    already_processed: input.alreadyProcessed,
    receipt_token: input.receiptToken,
    receipt_pending: receiptPending,
    order_summary: input.orderSummary,
  };
}

/**
 * Authoritative paid — the ONLY state that may clear the cart, the checkout
 * draft, or display success. A provider redirect, callback query string, or
 * receipt generation never satisfies this.
 */
export function isConfirmedPayment(result: PaymentCompletionState): boolean {
  return result.ok === true && result.payment_confirmed === true;
}

/** Back-compat alias used across the callback and success flows. */
export const shouldClearCheckoutCart = isConfirmedPayment;

/**
 * An APPLICATION-AUTHORITATIVE failure: the server verified with the provider
 * and the attempt definitively did not succeed. Distinct from transport
 * ambiguity (ok=false without failure_kind), which must stay retryable and
 * must never be worded as a decline.
 */
export function hasAuthoritativeFailure(
  result: PaymentCompletionState,
): result is PaymentCompletionState & {
  failure_kind: PaymentFailureKind;
  provider_status: string;
} {
  return (
    result.ok === false &&
    (result.failure_kind === "declined" || result.failure_kind === "failed") &&
    typeof result.provider_status === "string"
  );
}

export function buildPaymentWhatsAppUrl(input: {
  configuredUrl: string;
  orderReference: string;
  total: number;
  currency: string;
  items: Array<{ name: string; quantity: number }>;
  receiptUrl?: string;
}): string {
  let configured: URL;
  try {
    configured = new URL(input.configuredUrl);
  } catch {
    return "";
  }
  if (configured.protocol !== "https:" || configured.hostname.toLowerCase() !== "wa.me") return "";
  const phone = configured.pathname.replace(/\D/g, "");
  if (!phone) return "";
  const visibleItems = input.items.slice(0, 8);
  const itemLines = visibleItems.map((item) => `- ${item.name} × ${item.quantity}`);
  if (input.items.length > visibleItems.length) {
    itemLines.push(`- and ${input.items.length - visibleItems.length} more item(s)`);
  }
  const amount = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: input.currency,
    maximumFractionDigits: 2,
  }).format(input.total);
  const lines = [
    "Hello Diplomat Global,",
    "",
    "I just completed payment for:",
    ...itemLines,
    "",
    `Order ID: ${input.orderReference}`,
    `Amount: ${amount}`,
  ];
  if (input.receiptUrl) lines.push("", "Receipt:", input.receiptUrl);
  lines.push("", "Please confirm my order. Thank you.");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
