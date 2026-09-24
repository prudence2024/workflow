import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CHECKOUT_QUOTE_VERSION,
  orderMatchesQuote,
  type PaymentQuoteMetadata,
} from "./checkout-quote";

export const paymentSuccessInputSchema = z
  .object({
    reference: z
      .string()
      .regex(/^DG-[A-Z0-9-]{5,80}$/)
      .optional(),
    receiptToken: z.string().uuid().optional(),
  })
  .strict()
  .refine((input) => Boolean(input.reference || input.receiptToken));
type SuccessInput = z.infer<typeof paymentSuccessInputSchema>;
type Database = ReturnType<typeof import("./database.server").createDatabaseClient>;

// Read-only. Neither refresh nor receipt retry invokes Paystack or finalization.
export async function loadPaymentSuccessDetails(db: Database, input: SuccessInput) {
  const unavailable = { ok: false as const, message: "Payment details could not be loaded." };
  let reference = input.reference;
  if (!reference) {
    const receipt = await db
      .from("receipts")
      .select("transaction_id")
      .eq("download_token", input.receiptToken!)
      .maybeSingle();
    if (receipt.error || !receipt.data?.transaction_id) return unavailable;
    const payment = await db
      .from("payment_transactions")
      .select("reference")
      .eq("id", receipt.data.transaction_id)
      .maybeSingle();
    if (payment.error || !payment.data) return unavailable;
    reference = payment.data.reference;
  }
  const payment = await db
    .from("payment_transactions")
    .select("id, reference, order_id, amount, currency, status, metadata")
    .eq("reference", reference)
    .maybeSingle();
  if (payment.error || !payment.data) return unavailable;
  const transaction = payment.data;
  const result = await db
    .from("orders")
    .select(
      "id, reference, status, payment_reference, subtotal, discount, delivery_fee, total, currency, coupon_id, order_items(product_id, name, sku, quantity, unit_price, line_total)",
    )
    .eq("id", transaction.order_id)
    .maybeSingle();
  if (result.error || !result.data) return unavailable;
  const order = result.data;
  const metadata = transaction.metadata as Partial<PaymentQuoteMetadata> | null;
  if (
    transaction.status !== "successful" ||
    !["paid", "processing", "shipped", "delivered"].includes(order.status)
  ) {
    return {
      ok: false as const,
      canFinalize: ["pending", "abandoned"].includes(order.status),
      message: "This payment is not confirmed.",
    };
  }
  if (
    !metadata ||
    order.payment_reference !== reference ||
    metadata.order_id !== order.id ||
    metadata.order_reference !== order.reference ||
    metadata.quote_version !== CHECKOUT_QUOTE_VERSION ||
    !metadata.quote ||
    !orderMatchesQuote(order, metadata.quote) ||
    Number(transaction.amount) !== metadata.quote.total ||
    transaction.currency !== metadata.quote.currency
  ) {
    return unavailable;
  }
  let receiptState: "ready" | "pending" | "error" = "pending";
  let receiptToken: string | undefined;
  try {
    const receipt = await db
      .from("receipts")
      .select("download_token")
      .eq("order_id", order.id)
      .eq("transaction_id", transaction.id)
      .maybeSingle();
    if (receipt.error) receiptState = "error";
    else if (receipt.data?.download_token) {
      receiptToken = receipt.data.download_token;
      receiptState = "ready";
    }
  } catch {
    receiptState = "error";
  }
  return {
    ok: true as const,
    payment_confirmed: true as const,
    receiptState,
    order: {
      reference: order.reference,
      paymentStatus: order.status,
      total: Number(order.total),
      currency: order.currency,
      items: (order.order_items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
      receiptToken,
    },
  };
}

export const getPaymentSuccessDetails = createServerFn({ method: "POST" })
  .validator(paymentSuccessInputSchema)
  .handler(async ({ data }) => {
    const { createDatabaseClient } = await import("./database.server");
    return loadPaymentSuccessDetails(createDatabaseClient(), data);
  });
