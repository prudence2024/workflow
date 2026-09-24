import { emitLowStockTransition } from "./inventory-settings.server";
import type { InventoryRow } from "./inventory-lifecycle";
/**
 * Shared payment finalization service.
 * Both the Paystack callback redirect AND the webhook POST call this.
 * It is idempotent — safe to call multiple times for the same reference.
 *
 * RETRY-SAFE design:
 *   - The order CAS prevents concurrent requests from owning the same payment
 *   - Inventory and coupon mutations run only for the request that wins that CAS
 *   - Receipt creation checks for an existing order receipt
 *
 * A process crash after the order CAS but before all downstream effects remains
 * a reconciliation case until one transactional database marker/RPC owns the
 * complete finalization boundary. Do not describe this function as crash-atomic.
 *
 * Flow:
 *   1. Find the order
 *   2. Check if already fully finalized (has receipt) → return
 *   3. Verify with Paystack API (amount check)
 *   4. CAS: pending → paid (only if still pending)
 *   5. Post-CAS steps (some best-effort; retry ownership is explicit):
 *      a. Payment transaction record
 *      b. Decrement inventory (atomic conditional)
 *      c. Increment coupon usage (atomic conditional)
 *      d. Generate receipt (check existing)
 *      e. Send notifications (best-effort)
 *      f. Audit log
 */
import { createDatabaseClient } from "./database.server";
import {
  explainQuoteDivergence,
  isSameFinalizedPayment,
  validatePaymentBinding,
} from "./checkout-quote";
import type { PaymentQuoteMetadata } from "./checkout-quote";
import type { PaystackVerifyResponse } from "./paystack.server";
import { consumeCouponUseAtomic, shouldConsumeCouponForFinalization } from "./coupon-lifecycle";
import {
  decrementInventoryAtomic,
  shouldDecrementInventoryForFinalization,
} from "./inventory-lifecycle";
import {
  buildConfirmedPaymentState,
  mapProviderFailureKind,
  PROVIDER_DECLINED_STATUSES,
  type PaymentSuccessOrderSummary,
} from "./payment-client-state";
import { z } from "zod";
import { loadPaymentEmailConfig, type PaymentEmailConfig } from "./payment-email-config.server";
import { isFinancialFinalizationV1, isFinancialFinalizationV2 } from "./checkout-quote";

/**
 * Forensic capture for payment outcomes that end without success. The Owner
 * test payment exposed a silent class of failure: the deployed finalizer
 * recorded neither a completion nor an error, leaving no trace beyond the
 * pending transaction row. Every non-success provider verdict and every
 * integrity rejection now reaches Sentry with non-PII operational context so
 * a repeat can never be silent again.
 */
async function capturePaymentForensic(
  message: string,
  context: {
    reference: string;
    provider_status?: string;
    provider_reason?: string;
    provider_channel?: string;
    provider_amount_kobo?: number;
    provider_currency?: string;
    detail?: string;
  },
): Promise<void> {
  try {
    const Sentry = await import("@sentry/tanstackstart-react");
    Sentry.captureMessage(message, {
      level: "error",
      tags: { boundary: "payment-finalize" },
      extra: {
        reference: context.reference,
        provider_status: context.provider_status,
        provider_reason: context.provider_reason,
        provider_channel: context.provider_channel,
        provider_amount_kobo: context.provider_amount_kobo,
        provider_currency: context.provider_currency,
        detail: context.detail,
      },
    });
  } catch {
    // Telemetry must never alter the payment result.
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!,
  );
}

export interface FinalizeResult {
  ok: boolean;
  order_id?: string;
  reference?: string;
  message: string;
  payment_confirmed?: boolean;
  already_processed?: boolean;
  receipt_token?: string;
  receipt_pending?: boolean;
  order_summary?: PaymentSuccessOrderSummary;
  /** Present only on ok=false: provider-verified failure taxonomy. */
  failure_kind?: "declined" | "failed";
  provider_status?: string;
  provider_reason?: string;
}

type FinalizedOrderForResult = {
  id: string;
  reference: string;
  total: number;
  currency?: string | null;
  order_items?: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }> | null;
};

/**
 * Single authoritative customer display name for ALL receipt surfaces: the
 * name the customer actually submitted with THIS order
 * (order.shipping_address.full_name), which is the same value the approved
 * View/Print receipt shows. Falls back to the customer record, then email.
 * Live data proved customers.first_name+last_name can diverge from the order
 * (first-write-wins upsert on a reused email), so the per-order snapshot —
 * not the mutable customer row — must decide what the customer is called.
 */
function customerDisplayName(order: {
  shipping_address?: unknown;
  customers?: { first_name?: string | null; last_name?: string | null } | null;
  email: string;
}): string {
  const shipping =
    order.shipping_address && typeof order.shipping_address === "object"
      ? (order.shipping_address as { full_name?: unknown })
      : {};
  const shippingName = typeof shipping.full_name === "string" ? shipping.full_name.trim() : "";
  if (shippingName) return shippingName;
  const recordName = order.customers
    ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim()
    : "";
  return recordName || order.email;
}

/**
 * Downstream, best-effort effects that must never gate or revert financial
 * success: notifications, Telegram, admin email, customer email, audit log.
 * Every step catches its own failures.
 */
async function runPostCompletionEffects(input: {
  db: FinalizeDb;
  order: FinalizeOrderRow;
  reference: string;
  total: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  receiptToken?: string;
}): Promise<void> {
  const { order, reference } = input;
  try {
    const { notifications } = await import("@/lib/notifications");
    await notifications.paymentSuccess(order.id, input.total, input.customerName);
  } catch (err) {
    console.error("[payment-finalize] Notification failed:", err);
  }
  try {
    const { sendPaymentNotification } = await import("./telegram.server");
    await sendPaymentNotification({
      amount: input.total,
      currency: input.currency,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      reference,
      status: "success",
      paidAt: new Date(),
    });
  } catch (err) {
    console.error("[payment-finalize] Telegram notification failed:", err);
  }
  let emailConfig: PaymentEmailConfig | undefined;
  try {
    emailConfig = await loadPaymentEmailConfig(input.db, input.receiptToken);
  } catch {
    console.error("[payment-finalize] Email business configuration unavailable");
  }
  try {
    if (!emailConfig) throw new Error("Email configuration unavailable");
    const { sendTransactionalEmail } = await import("./email.server");
    const amount = input.total.toLocaleString("en-NG", { style: "currency", currency: "NGN" });
    await sendTransactionalEmail({
      to: process.env.CONTACT_OWNER_EMAIL?.trim() || "",
      subject: `New order ${reference} — ${amount}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#0891b2">New Order Received</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#666">Reference</td><td style="padding:8px 0;font-weight:600">${escapeHtml(reference)}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Customer</td><td style="padding:8px 0">${escapeHtml(input.customerName)} (${escapeHtml(input.customerEmail)})</td></tr>
          <tr><td style="padding:8px 0;color:#666">Amount</td><td style="padding:8px 0;font-weight:600">${amount}</td></tr>
        </table>
        <p style="color:#666;font-size:13px">View this order in the <a href="${escapeHtml(emailConfig.dashboardUrl)}" style="color:#0891b2">admin dashboard</a>.</p>
      </div>`,
    });
  } catch (err) {
    console.error("[payment-finalize] Admin email notification failed:", err);
  }
  // Canonical receipt PDF attachment: rendered from the same immutable
  // receipt document as the Download Receipt button — no second financial
  // record, no client data. Best-effort by contract: an attachment failure
  // must never downgrade the paid order, block the email, or touch the
  // receipt row.
  let receiptPdfAttachment: { filename: string; contentBase64: string } | undefined;
  let receiptDoc: import("@/lib/receipt-document").ReceiptDocumentData | null = null;
  if (input.receiptToken) {
    try {
      const { loadReceiptDocumentByToken } = await import("@/lib/receipt.server");
      const { formatReceiptPdfFilename, generateReceiptPdf } = await import("@/lib/receipt-pdf");
      receiptDoc = await loadReceiptDocumentByToken(input.receiptToken);
      if (receiptDoc) {
        receiptPdfAttachment = {
          filename: formatReceiptPdfFilename(receiptDoc.receipt_number),
          contentBase64: Buffer.from(generateReceiptPdf(receiptDoc)).toString("base64"),
        };
      }
    } catch (err) {
      console.error("[payment-finalize] Receipt PDF attachment unavailable:", err);
    }
  }
  try {
    if (!emailConfig) throw new Error("Email configuration unavailable");
    await sendCustomerConfirmationEmail({
      emailConfig,
      reference,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      total: input.total,
      // The canonical receipt document is the single financial source for the
      // email too: same receipt number, payment reference, items and totals as
      // the attached PDF and the Download Receipt button.
      receiptNumber: receiptDoc?.receipt_number ?? "",
      paystackReference: receiptDoc?.payment_reference || undefined,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryFee: Number(order.delivery_fee),
      items: (order.order_items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        line_total: Number(item.line_total),
      })),
      paymentDate: receiptDoc?.payment_date ?? new Date().toISOString(),
      receiptAttachment: receiptPdfAttachment,
      receiptUrl: emailConfig.receiptUrl,
    });
  } catch (err) {
    console.error("[payment-finalize] Customer confirmation email failed:", err);
  }
  if (input.receiptToken) {
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.receiptGenerated(order.id);
    } catch (err) {
      console.error("[payment-finalize] Receipt notification failed:", err);
    }
  }
  // Secure guest Verified-Purchase claims (Owner-approved): one hashed
  // capability claim per purchased product, issued only for newly-completed
  // payments. Pure DB writes; email delivery is separate and failure-tolerant.
  // Token-hash secrets are read inside this server boundary only.
  try {
    const { ensureReviewClaimForOrderProduct, getReviewClaimSiteOrigin } =
      await import("./review-claims.server");
    const siteOrigin = await getReviewClaimSiteOrigin();
    for (const item of order.order_items ?? []) {
      if (!item.product_id) continue;
      const { rawToken } = await ensureReviewClaimForOrderProduct({
        db: input.db,
        orderId: order.id,
        productId: item.product_id,
        customerId: order.customer_id,
        siteOrigin,
      });
      if (rawToken) {
        // Raw token exists only here, once. Delivery goes to the purchaser's
        // order email; a delivery failure never affects finalization — the
        // idempotent claim stays available for retry delivery.
        const { sendTransactionalEmail } = await import("./email.server");
        const reviewUrl = `${siteOrigin.replace(/\/+$/, "")}/reviews?claim=${encodeURIComponent(rawToken)}`;
        await sendTransactionalEmail({
          to: input.customerEmail,
          subject: `Share your verified review — ${item.name}`,
          html:
            `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:20px">` +
            `<h2 style="color:#0891b2">Thank you for your purchase!</h2>` +
            `<p>You bought <strong>${escapeHtml(item.name)}</strong>. We'd love your honest review — ` +
            `your review will carry a <strong>Verified Purchase</strong> badge.</p>` +
            `<p><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:600">Write your verified review</a></p>` +
            `              <p style="color:#666;font-size:13px">This personal link works once and expires in 30 days. It is yours alone — anyone holding it can post your product's verified review, so please keep this email private.</p>` +
            `</div>`,
          text: `Thank you for your purchase! Review ${item.name}: ${reviewUrl} (one-time link, expires in 30 days).`,
        });
      }
    }
  } catch (claimErr) {
    // Claims are additive capability records — never block financial truth.
    console.error("[payment-finalize] review-claim issuance failed:", claimErr);
  }
  try {
    await input.db.from("audit_logs").insert({
      clerk_user_id: "system",
      action: "payment.finalize",
      entity_type: "order",
      entity_id: order.id,
      metadata: { reference, amount: input.total, customer_email: input.customerEmail },
    });
  } catch (err) {
    console.error("[payment-finalize] Final audit log failed:", err);
  }
}

type FinalizeOrderRow = {
  id: string;
  email: string;
  customer_id: string;
  subtotal: number | string;
  discount: number | string;
  delivery_fee: number | string;
  total: number | string;
  customers?: { first_name?: string | null; last_name?: string | null } | null;
  order_items?: Array<{
    product_id?: string | null;
    name: string;
    sku?: string | null;
    quantity: number;
    unit_price: number | string;
    line_total: number | string;
  }> | null;
};

/** Branded customer payment-confirmation email shared by both finalization paths. */
async function sendCustomerConfirmationEmail(input: {
  reference: string;
  customerName: string;
  customerEmail: string;
  total: number;
  /** Receipt number from the canonical receipt document (empty only if unavailable). */
  receiptNumber: string;
  paystackReference?: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  items: Array<{ name: string; quantity: number; line_total: number }>;
  paymentDate: string;
  emailConfig: PaymentEmailConfig;
  /** Canonical receipt URL (same one the Download Receipt button uses). */
  receiptUrl: string;
  /** Canonical receipt PDF (base64). Attachment failure never blocks the email. */
  receiptAttachment?: { filename: string; contentBase64: string };
}): Promise<void> {
  const { sendTransactionalEmail } = await import("./email.server");
  const { paymentReceiptTemplate } = await import("./email-templates.server");
  const html = paymentReceiptTemplate({
    customerName: input.customerName,
    receiptNumber: input.receiptNumber,
    orderReference: input.reference,
    paystackReference: input.paystackReference,
    items: input.items,
    subtotal: input.subtotal,
    discount: input.discount,
    delivery_fee: input.deliveryFee,
    total: input.total,
    paymentDate: input.paymentDate,
    receiptUrl: input.receiptUrl,
    company: {
      name: input.emailConfig.businessName,
      email: input.emailConfig.supportEmail,
      website: input.emailConfig.websiteUrl,
    },
  });
  await sendTransactionalEmail({
    to: input.customerEmail,
    subject: input.receiptNumber
      ? `Payment Confirmed — Receipt ${input.receiptNumber} (Order ${input.reference})`
      : `Payment Confirmed — Order ${input.reference}`,
    text: `Hello ${input.customerName},

Your payment of NGN ${input.total.toLocaleString("en-NG")} for order ${input.reference} has been confirmed.
Payment date: ${new Date(input.paymentDate).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
Receipt number: ${input.receiptNumber || "see attached PDF"}

Your receipt PDF is attached; you can also view or download it at ${input.receiptUrl}

Thank you for shopping with ${input.emailConfig.businessName}.

© ${new Date().getFullYear()} ${input.emailConfig.businessName}. All rights reserved.`,
    ...(input.receiptAttachment ? { attachments: [input.receiptAttachment] } : {}),
    html,
  });
}

function buildOrderSummary(order: FinalizedOrderForResult): PaymentSuccessOrderSummary {
  return {
    reference: order.reference,
    paymentStatus: "paid",
    total: Number(order.total),
    currency: order.currency || "NGN",
    items: (order.order_items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  };
}

function confirmedPaymentResult(input: {
  order: FinalizedOrderForResult;
  reference: string;
  receiptToken?: string;
  alreadyProcessed?: boolean;
}): FinalizeResult {
  return buildConfirmedPaymentState({
    orderId: input.order.id,
    reference: input.reference,
    orderSummary: buildOrderSummary(input.order),
    receiptToken: input.receiptToken,
    alreadyProcessed: input.alreadyProcessed,
  });
}

type FinalizeDb = ReturnType<typeof createDatabaseClient>;

export const financialCompletionSchema = z
  .object({
    complete: z.literal(true),
    already_complete: z.boolean(),
    order_id: z.string().uuid(),
  })
  .strict();
export type FinancialCompletionResult = z.infer<typeof financialCompletionSchema>;

async function completeFinancialV1(input: {
  db: FinalizeDb;
  transactionId: string;
  reference: string;
  providerAmountKobo: number;
  providerCurrency: string;
  verifiedAt: Date;
}): Promise<
  | { ok: true; result: FinancialCompletionResult }
  | { ok: false; reconcile: boolean; message: string }
> {
  try {
    const { data, error } = await input.db.rpc("complete_verified_payment_v1", {
      p_transaction_id: input.transactionId,
      p_reference: input.reference,
      p_amount_kobo: input.providerAmountKobo,
      p_currency: input.providerCurrency,
      p_verified_at: input.verifiedAt.toISOString(),
    });
    if (error)
      return {
        ok: false,
        reconcile: /reconciliation/i.test(error.message),
        message: "Financial completion unavailable",
      };
    const parsed = financialCompletionSchema.safeParse(data);
    if (!parsed.success)
      return { ok: false, reconcile: true, message: "Invalid financial completion response" };
    return { ok: true, result: parsed.data };
  } catch {
    // An ambiguous transport failure must never enter the legacy write path.
    return { ok: false, reconcile: false, message: "Financial completion response unavailable" };
  }
}

/** v2 path — identical call shape and error contract as v1 (marker-selected). */
async function completeFinancialV2(input: {
  db: FinalizeDb;
  transactionId: string;
  reference: string;
  providerAmountKobo: number;
  providerCurrency: string;
  verifiedAt: Date;
}): Promise<
  | { ok: true; result: FinancialCompletionResult }
  | { ok: false; reconcile: boolean; message: string }
> {
  try {
    const { data, error } = await input.db.rpc("complete_verified_payment_v2", {
      p_transaction_id: input.transactionId,
      p_reference: input.reference,
      p_amount_kobo: input.providerAmountKobo,
      p_currency: input.providerCurrency,
      p_verified_at: input.verifiedAt.toISOString(),
    });
    if (error)
      return {
        ok: false,
        reconcile: /reconciliation/i.test(error.message),
        message: "Financial completion unavailable",
      };
    const parsed = financialCompletionSchema.safeParse(data);
    if (!parsed.success)
      return { ok: false, reconcile: true, message: "Invalid financial completion response" };
    return { ok: true, result: parsed.data };
  } catch {
    // An ambiguous transport failure must never enter the legacy write path.
    return { ok: false, reconcile: false, message: "Financial completion response unavailable" };
  }
}

/**
 * Marker-selected dispatch: the transaction's OWN stored
 * financial_finalization_version decides v1 vs v2 — identical semantics and
 * error contract for both; only the RPC name differs.
 */
async function completeFinancialViaMarker(input: {
  db: FinalizeDb;
  metadata: unknown;
  transactionId: string;
  reference: string;
  providerAmountKobo: number;
  providerCurrency: string;
  verifiedAt: Date;
}): Promise<
  | { ok: true; result: FinancialCompletionResult }
  | { ok: false; reconcile: boolean; message: string }
> {
  return isFinancialFinalizationV2(input.metadata)
    ? completeFinancialV2(input)
    : completeFinancialV1(input);
}

/** Idempotent receipt creation shared by the v1 and legacy finalization paths. */
async function ensureReceiptForOrder(input: {
  db: FinalizeDb;
  orderId: string;
  transactionId: string;
  reference: string;
  customerEmail: string;
  itemsSnapshot: unknown;
  subtotal: number | string;
  discount: number | string;
  deliveryFee: number | string;
  total: number | string;
  currency: string;
}): Promise<string | undefined> {
  const { data: existingReceipt } = await input.db
    .from("receipts")
    .select("download_token")
    .eq("order_id", input.orderId)
    .limit(1)
    .maybeSingle();
  if (existingReceipt?.download_token) return existingReceipt.download_token;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { data: lastReceipt } = await input.db
    .from("receipts")
    .select("receipt_number")
    .like("receipt_number", `DG-${today}-%`)
    .order("receipt_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (lastReceipt && lastReceipt.length > 0) {
    const last = lastReceipt[0].receipt_number;
    seq = parseInt(last.replace(`DG-${today}-`, ""), 10) + 1;
  }
  const receiptNumber = `DG-${today}-${String(seq).padStart(6, "0")}`;

  const { data: newReceipt, error: receiptError } = await input.db
    .from("receipts")
    .insert({
      order_id: input.orderId,
      transaction_id: input.transactionId,
      receipt_number: receiptNumber,
      customer_email: input.customerEmail,
      items_snapshot: input.itemsSnapshot,
      subtotal: input.subtotal,
      discount: input.discount,
      delivery_fee: input.deliveryFee,
      total: input.total,
      currency: input.currency || "NGN",
      status: "generated",
    })
    .select("download_token")
    .single();
  if (newReceipt?.download_token) return newReceipt.download_token;
  if (receiptError) {
    const { data: concurrentlyCreatedReceipt } = await input.db
      .from("receipts")
      .select("download_token")
      .eq("order_id", input.orderId)
      .maybeSingle();
    if (concurrentlyCreatedReceipt?.download_token) {
      return concurrentlyCreatedReceipt.download_token;
    }
    console.error("[payment-finalize] Receipt creation failed:", receiptError);
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.receiptFailed(input.orderId, receiptError.message);
    } catch (_) {
      // Receipt failure alerting is best-effort.
    }
  }
  return undefined;
}

export async function finalizePayment(reference: string): Promise<FinalizeResult> {
  if (reference === "DG-MTLML9QG-WWA7") {
    return {
      ok: false,
      reference,
      message: "This historical payment requires separate reconciliation. Please do not pay again.",
    };
  }
  const db = createDatabaseClient();

  // 1. A provider reference must resolve to its own immutable payment attempt.
  let transactionResult = await db
    .from("payment_transactions")
    .select("id, order_id, reference, paystack_reference, amount, currency, status, metadata")
    .eq("reference", reference)
    .maybeSingle();
  if (!transactionResult.data && !transactionResult.error) {
    transactionResult = await db
      .from("payment_transactions")
      .select("id, order_id, reference, paystack_reference, amount, currency, status, metadata")
      .eq("paystack_reference", reference)
      .maybeSingle();
  }
  const transaction = transactionResult.data;
  if (transactionResult.error || !transaction?.order_id) {
    return { ok: false, reference, message: "This payment reference could not be confirmed." };
  }

  const orderResult = await db
    .from("orders")
    .select("*, order_items(*), customers(first_name, last_name)")
    .eq("id", transaction.order_id)
    .single();
  const order = orderResult.data;
  if (orderResult.error || !order) {
    return { ok: false, reference, message: "This payment reference could not be confirmed." };
  }

  // 2. Verify the exact provider reference and its immutable server quote.
  let paystackData: PaystackVerifyResponse["data"];
  try {
    const { verifyTransaction } = await import("./paystack.server");
    const verification = await verifyTransaction(reference);
    paystackData = verification.data;
  } catch (error) {
    console.error(`[payment-finalize] Provider verification failed for ${reference}`, error);
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.paymentVerificationFailed(reference, "Provider verification unavailable");
    } catch (_) {
      // The customer-facing response remains authoritative if alerting is unavailable.
    }
    return {
      ok: false,
      reference,
      message: "We could not confirm this payment yet. Please do not make another payment.",
    };
  }

  if (paystackData.status !== "success") {
    const pendingStatuses = new Set(["pending", "ongoing", "processing"]);
    if (pendingStatuses.has(paystackData.status)) {
      return {
        ok: false,
        reference,
        message: "Payment verification is pending. Please do not make another payment.",
      };
    }
    // Definitive provider verdict on the attempt. "declined" is reserved for
    // provider rejections of the payment itself; transport/verification
    // problems never reach this branch.
    const failureKind = mapProviderFailureKind(paystackData.status);
    // A reversed/refunded attempt is the provider's own verdict that the money
    // did NOT stay received — echoing the attempt's original gateway_response
    // (still "Successful" at Paystack) would contradict the decline.
    const providerReason =
      PROVIDER_DECLINED_STATUSES.has(paystackData.status) &&
      (paystackData.gateway_response || "").toLowerCase() === "successful"
        ? paystackData.status
        : paystackData.gateway_response || paystackData.status;
    void capturePaymentForensic(
      failureKind === "declined"
        ? "Payment attempt declined by provider"
        : "Payment attempt ended without success",
      {
        reference,
        provider_status: paystackData.status,
        provider_reason: paystackData.gateway_response,
        provider_channel: paystackData.channel,
        provider_amount_kobo: paystackData.amount,
        provider_currency: paystackData.currency,
      },
    );
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.paymentFailed(order.id, paystackData.gateway_response);
    } catch (_) {
      // Payment failure alerting is best-effort.
    }
    // Durable attempt-outcome record: payment_transactions.status already has
    // a DB CHECK allowing 'failed'; gateway_response preserves the provider's
    // own reason. This is a payment-attempt status — the order stays pending
    // and may still be paid by a later attempt.
    try {
      await db
        .from("payment_transactions")
        .update({
          status: "failed",
          gateway_response:
            paystackData.gateway_response || `Provider status: ${paystackData.status}`,
          channel: paystackData.channel || undefined,
        })
        .eq("id", transaction.id)
        .in("status", ["initiated", "pending", "abandoned"]); // never overwrite a successful/failed record
    } catch (err) {
      console.error("[payment-finalize] Failed-attempt recording error:", err);
    }
    // Authoritative release: a DEFINITIVE provider verdict (declined or
    // confirmed failure) frees the coupon slot immediately. Unknown/ambiguous
    // provider state never reaches this branch — the reservation then holds
    // until TTL by design (never release on uncertainty).
    try {
      const { releaseCouponReservation } = await import("./payment-finalizer-selector.server");
      const reservationId = (transaction.metadata as { reservation_id?: string } | null)
        ?.reservation_id;
      await releaseCouponReservation(db, reservationId ?? null);
    } catch (releaseErr) {
      console.error("[payment-finalize] Reservation release error:", releaseErr);
    }
    return {
      ok: false,
      reference,
      failure_kind: failureKind,
      provider_status: paystackData.status,
      provider_reason: providerReason,
      message:
        failureKind === "declined"
          ? `Your payment was declined by the payment provider${providerReason && providerReason !== paystackData.status ? `: ${providerReason}` : ""}. Your cart and details have been preserved — you can safely retry payment.`
          : "This payment attempt did not go through. Your cart and details have been preserved.",
    };
  }

  const binding = validatePaymentBinding({ reference, transaction, order, provider: paystackData });
  if (!binding.ok) {
    console.error(
      `[payment-finalize] Payment integrity rejection for ${reference}: ${binding.reason}`,
    );
    // For order-level divergence, attach a bounded, non-PII field diff so a
    // real financial mismatch is distinguishable from a serialization
    // artifact without re-querying production rows.
    let divergenceDetail = binding.reason;
    if (binding.reason === "order_quote_mismatch") {
      try {
        const metadata = transaction.metadata as Partial<PaymentQuoteMetadata> | null;
        const storedQuote = metadata?.quote;
        if (storedQuote) {
          divergenceDetail = [
            binding.reason,
            ...explainQuoteDivergence(
              {
                subtotal: order.subtotal,
                discount: order.discount,
                delivery_fee: order.delivery_fee,
                total: order.total,
                currency: order.currency ?? "NGN",
                coupon_id: order.coupon_id ?? null,
                items: (order.order_items ?? []).map(
                  (item: {
                    product_id: string | null;
                    sku: string;
                    name: string;
                    quantity: number;
                    unit_price: number | string;
                    line_total: number | string;
                  }) => ({
                    product_id: item.product_id,
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    unit_price: Number(item.unit_price),
                    line_total: Number(item.line_total),
                  }),
                ),
              },
              {
                subtotal: storedQuote.subtotal,
                discount: storedQuote.discount,
                delivery_fee: storedQuote.delivery_fee,
                total: storedQuote.total,
                currency: storedQuote.currency,
                coupon_id: storedQuote.coupon_id,
                items: storedQuote.items,
              },
            ),
          ].join(" | ");
        }
      } catch {
        // Forensic detail is best-effort; the rejection reason stands alone.
      }
    }
    void capturePaymentForensic("Payment binding rejection", {
      reference,
      provider_status: paystackData.status,
      provider_reason: paystackData.gateway_response,
      provider_amount_kobo: paystackData.amount,
      provider_currency: paystackData.currency,
      detail: divergenceDetail.slice(0, 500),
    });
    return {
      ok: false,
      reference,
      message:
        "We received your payment response but could not confirm the order automatically. " +
        "Your reference has been recorded. Please do not make another payment.",
    };
  }

  // Durable financial boundary for protocol-marked attempts: the approved RPC
  // (v1 or v2, selected by the payment's OWN stored marker — never the
  // executing deployment's flag; callback and webhook may run on different
  // deployments) commits payment success, order paid, inventory, coupon and
  // reservation conversion atomically. The provider verification above
  // (reference, kobo amount, currency, binding) is the only authorization; no
  // browser value participates. Repeats converge idempotently.
  if (
    isFinancialFinalizationV1(transaction.metadata) ||
    isFinancialFinalizationV2(transaction.metadata)
  ) {
    const financial = await completeFinancialViaMarker({
      db,
      metadata: transaction.metadata,
      transactionId: transaction.id,
      reference,
      providerAmountKobo: paystackData.amount,
      providerCurrency: paystackData.currency,
      verifiedAt: new Date(),
    });
    if (!financial.ok) {
      console.error(
        `[payment-finalize] Financial completion rejected for ${reference}: ${financial.message}`,
      );
      void capturePaymentForensic("Financial completion rejected", {
        reference,
        provider_status: paystackData.status,
        provider_reason: paystackData.gateway_response,
        provider_amount_kobo: paystackData.amount,
        provider_currency: paystackData.currency,
        detail: financial.message,
      });
      try {
        const { notifications } = await import("@/lib/notifications");
        await notifications.paymentVerificationFailed(
          reference,
          financial.reconcile ? "Requires reconciliation" : "Financial completion rejected",
        );
      } catch (_) {
        // Alerting is best-effort; the customer response stays authoritative.
      }
      return {
        ok: false,
        reference,
        message: financial.reconcile
          ? "We received your payment but cannot complete it automatically yet. " +
            "Your reference has been recorded. Please do not make another payment."
          : "We received your payment response but could not confirm the order automatically. " +
            "Your reference has been recorded. Please do not make another payment.",
      };
    }
    if (financial.result.order_id !== order.id) {
      return {
        ok: false,
        reference,
        message: "This payment could not be confirmed. Please do not pay again.",
      };
    }
    // RPC's committed result establishes paid authority. A later read/receipt outage
    // cannot undo it. Read fresh committed rows for downstream consumers.
    let completedOrder = order;
    try {
      const fresh = await db
        .from("orders")
        .select("*, order_items(*), customers(first_name, last_name)")
        .eq("id", financial.result.order_id)
        .single();
      if (
        fresh.error ||
        !fresh.data ||
        !isSameFinalizedPayment(fresh.data, reference) ||
        !validatePaymentBinding({
          reference,
          transaction,
          order: fresh.data,
          provider: paystackData,
        }).ok
      ) {
        return confirmedPaymentResult({
          order,
          reference,
          alreadyProcessed: financial.result.already_complete,
        });
      }
      completedOrder = fresh.data;
    } catch {
      return confirmedPaymentResult({
        order,
        reference,
        alreadyProcessed: financial.result.already_complete,
      });
    }
    let receiptToken: string | undefined;
    try {
      receiptToken = await ensureReceiptForOrder({
        db,
        orderId: completedOrder.id,
        transactionId: transaction.id,
        reference,
        customerEmail: completedOrder.email,
        itemsSnapshot: completedOrder.order_items,
        subtotal: completedOrder.subtotal,
        discount: completedOrder.discount,
        deliveryFee: completedOrder.delivery_fee,
        total: completedOrder.total,
        currency: completedOrder.currency,
      });
    } catch {
      // Receipt creation has its own unique order key; safe to retry on completion recheck.
    }
    if (!financial.result.already_complete) {
      // These deliveries have no durable outbox. Never blindly replay after response loss.
      await runPostCompletionEffects({
        db,
        order: completedOrder,
        reference,
        total: Number(completedOrder.total),
        currency: completedOrder.currency,
        customerEmail: completedOrder.email,
        customerName: customerDisplayName(completedOrder),
        receiptToken,
      });
    }
    return confirmedPaymentResult({
      order: completedOrder,
      reference,
      receiptToken,
      alreadyProcessed: financial.result.already_complete || undefined,
    });
  }

  const { data: finalizedTransaction, error: transactionUpdateError } = await db
    .from("payment_transactions")
    .update({
      status: "successful",
      paid_at: new Date().toISOString(),
      channel: paystackData.channel || "paystack",
      gateway_response: paystackData.gateway_response || "Payment verified successfully",
    })
    .eq("id", transaction.id)
    .select("id")
    .maybeSingle();
  if (transactionUpdateError || !finalizedTransaction) {
    console.error(
      `[payment-finalize] Transaction update failed for ${reference}`,
      transactionUpdateError,
    );
    return {
      ok: false,
      reference,
      message:
        "We received your payment response but could not confirm the order automatically. " +
        "Your reference has been recorded. Please do not make another payment.",
    };
  }

  // 3. Check if already fully finalized.
  const terminalStatuses = ["paid", "processing", "shipped", "delivered"];
  const isPaid = terminalStatuses.includes(order.status);

  if (isPaid) {
    if (order.payment_reference !== reference) {
      return {
        ok: false,
        reference,
        message:
          "We received your payment response but could not confirm the order automatically. " +
          "Your reference has been recorded. Please do not make another payment.",
      };
    }
    const { data: existingReceipt } = await db
      .from("receipts")
      .select("download_token")
      .eq("order_id", order.id)
      .limit(1)
      .maybeSingle();

    if (existingReceipt?.download_token) {
      return confirmedPaymentResult({
        order,
        reference,
        receiptToken: existingReceipt.download_token,
        alreadyProcessed: true,
      });
    }
    // The payment is authoritative even while its receipt is missing. Continue
    // only far enough to retry idempotent receipt creation; inventory, coupon,
    // and notification delivery remain CAS-winner-only.
  }

  // Process from pending OR abandoned status.
  // Abandoned orders can receive late payments — do not silently ignore money.
  // The CAS below ensures only one finalization succeeds.
  const wasAbandoned = order.status === "abandoned";
  let orderClaimedByThisRequest = false;
  if (!isPaid && !wasAbandoned && order.status !== "pending") {
    return {
      ok: false,
      reference,
      message:
        "We received your payment response but could not confirm the order automatically. " +
        "Your reference has been recorded. Please do not make another payment.",
    };
  }

  // 4. CAS: pending/abandoned → paid (only if not already paid)
  //    This is our distributed lock — only one caller succeeds.
  //    Supports late payments on abandoned orders.
  if (!isPaid) {
    const { data: claimedOrder, error: updateError } = await db
      .from("orders")
      .update({
        status: "paid",
        payment_reference: reference,
      })
      .eq("id", order.id)
      .in("status", ["pending", "abandoned"])
      .select("id")
      .maybeSingle(); // CAS condition — allows late payment on abandoned

    if (updateError) {
      console.error("[payment-finalize] Order update failed:", updateError);
      return {
        ok: false,
        reference,
        message:
          "We received your payment response but could not confirm the order automatically. " +
          "Your reference has been recorded. Please do not make another payment.",
      };
    }

    if (!claimedOrder) {
      const { data: concurrentOrder } = await db
        .from("orders")
        .select("status, payment_reference")
        .eq("id", order.id)
        .single();
      if (!isSameFinalizedPayment(concurrentOrder, reference)) {
        return {
          ok: false,
          order_id: order.id,
          reference,
          message:
            "We received your payment response but could not confirm the order automatically. " +
            "Your reference has been recorded. Please do not make another payment.",
        };
      }
      const { data: concurrentReceipt } = await db
        .from("receipts")
        .select("download_token")
        .eq("order_id", order.id)
        .maybeSingle();
      return confirmedPaymentResult({
        order,
        reference,
        receiptToken: concurrentReceipt?.download_token || undefined,
        alreadyProcessed: true,
      });
    }
    orderClaimedByThisRequest = true;

    // If this was an abandoned order that just received payment, notify
    if (wasAbandoned) {
      try {
        const { notifications } = await import("@/lib/notifications");
        await notifications.latePaymentReconciliation(order.id);
      } catch (_) {
        // Late-payment alerting is best-effort.
      }
    }
  }

  // 5. Post-CAS steps — retry ownership is explicit per mutation.

  // 5a. Decrement inventory only for the caller that won the paid-order CAS.
  // Exact-value CAS prevents lost updates between different paid orders.
  const outOfStockItems: string[] = [];
  if (
    shouldDecrementInventoryForFinalization({
      orderWasAlreadyPaid: isPaid,
      orderClaimedByThisRequest,
    })
  ) {
    for (const item of order.order_items || []) {
      if (!item.product_id) continue;

      let beforeInventory: InventoryRow | null = null;
      const inventoryResult = await decrementInventoryAtomic(
        item.quantity,
        async () => {
          const { data, error } = await db
            .from("inventory")
            .select("quantity, reserved, low_stock_threshold")
            .eq("product_id", item.product_id)
            .maybeSingle();
          beforeInventory = data;
          return { data, error };
        },
        async ({ expectedQuantity, nextQuantity }) => {
          const { data, error } = await db
            .from("inventory")
            .update({ quantity: nextQuantity })
            .eq("product_id", item.product_id)
            .eq("quantity", expectedQuantity)
            .select("quantity")
            .maybeSingle();
          return { data, error };
        },
      );

      if (!inventoryResult.decremented) {
        outOfStockItems.push(
          `${item.name} (ordered: ${item.quantity}, available: ${inventoryResult.available ?? "unknown"}, reason: ${inventoryResult.reason})`,
        );
        continue;
      }

      await emitLowStockTransition(
        db,
        { id: item.product_id, name: item.name },
        beforeInventory,
        {
          ...(beforeInventory as InventoryRow | null),
          quantity: inventoryResult.quantity,
        },
        "sale",
        reference,
      );
    }
  }

  // If items are out of stock, flag for reconciliation.
  // Payment is still valid — the customer was charged. Do not auto-refund.
  if (outOfStockItems.length > 0) {
    console.error(
      `[payment-finalize] OUT-OF-STOCK for order ${reference}: ${outOfStockItems.join(", ")}. Requires manual reconciliation.`,
    );
    try {
      await db.from("audit_logs").insert({
        clerk_user_id: "system",
        action: "payment.out_of_stock",
        entity_type: "order",
        entity_id: order.id,
        metadata: { reference, out_of_stock_items: outOfStockItems },
      });
    } catch (err) {
      console.error("[payment-finalize] Audit log failed:", err);
    }
  }

  // 5c. Increment coupon usage with an exact-value CAS.
  if (
    order.coupon_id &&
    shouldConsumeCouponForFinalization({
      orderWasAlreadyPaid: isPaid,
      orderClaimedByThisRequest,
    })
  ) {
    const couponUse = await consumeCouponUseAtomic(
      async () => {
        const { data, error } = await db
          .from("coupons")
          .select("uses, max_uses")
          .eq("id", order.coupon_id)
          .maybeSingle();
        return { data, error };
      },
      async ({ expectedUses, nextUses, maxUses }) => {
        let update = db
          .from("coupons")
          .update({ uses: nextUses })
          .eq("id", order.coupon_id)
          .eq("uses", expectedUses);
        if (maxUses !== null) update = update.lt("uses", maxUses);
        const { data, error } = await update.select("uses, max_uses").maybeSingle();
        return { data, error };
      },
    );
    if (!couponUse.consumed && couponUse.reason === "exhausted") {
      // Last-use race: two distinct orders both carried this coupon quote and
      // the other order consumed the final use first. This order keeps its
      // provider-verified paid state (payment happened — never downgraded),
      // but the discount honouring must be surfaced for reconciliation.
      console.error(
        `[payment-finalize] COUPON_LAST_USE_RACE order=${reference} coupon=${order.coupon_id}: discount honoured without a remaining use`,
      );
      try {
        await db.from("audit_logs").insert({
          clerk_user_id: "system",
          action: "payment.coupon_last_use_race",
          entity_type: "order",
          entity_id: order.id,
          metadata: { reference, coupon_id: order.coupon_id },
        });
      } catch (auditErr) {
        console.error("[payment-finalize] Coupon race audit log failed:", auditErr);
      }
    } else if (!couponUse.consumed) {
      console.warn(
        `[payment-finalize] Coupon use not consumed for ${order.coupon_id}: ${couponUse.reason}`,
      );
    }
  }

  // Receipt availability never changes financial authority.
  let receiptToken: string | undefined;
  try {
    receiptToken = await ensureReceiptForOrder({
      db,
      orderId: order.id,
      transactionId: transaction.id,
      reference,
      customerEmail: order.email,
      itemsSnapshot: order.order_items,
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.delivery_fee,
      total: order.total,
      currency: order.currency,
    });
  } catch {
    // The unique order receipt can be retried independently.
  }

  if (!orderClaimedByThisRequest) {
    return confirmedPaymentResult({
      order,
      reference,
      receiptToken,
      alreadyProcessed: true,
    });
  }

  // 5d3. Inventory notifications
  if (outOfStockItems.length > 0) {
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.outOfStock(
        order.order_items?.[0]?.product_id || "unknown",
        order.order_items?.[0]?.name || "Product",
      );
    } catch (err) {
      console.error("[payment-finalize] Inventory notification failed:", err);
    }
  }

  await runPostCompletionEffects({
    db,
    order,
    reference,
    total: Number(order.total),
    currency: order.currency,
    customerEmail: order.email,
    customerName: customerDisplayName(order),
    receiptToken,
  });

  console.log(`[payment-finalize] Order ${reference} finalized successfully`);
  return confirmedPaymentResult({ order, reference, receiptToken });
}
