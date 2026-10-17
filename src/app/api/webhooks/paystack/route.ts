import { convergePaystackWebhook, PaymentVerificationError } from "@/lib/payments";
import {
  markWebhookProcessed,
  recordWebhookEvent,
  verifyPaystackSignature,
} from "@/lib/webhooks";
import { readWebhookBody, WebhookBodyTooLargeError } from "@/lib/webhookBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type PaystackPayload = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    paid_at?: string;
    channel?: string;
  };
};

/**
 * POST /api/webhooks/paystack
 *
 * Paystack signs the raw body. Only a signed charge.success event can move a
 * pending local payment to verified; all organization and plan data comes
 * from the existing payment row, never from the webhook's client-controlled
 * organization fields.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await readWebhookBody(request);
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return new Response(JSON.stringify({ error: "payload too large" }), { status: 413, headers: JSON_HEADERS });
    }
    rawBody = "";
  }
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyPaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let body: PaystackPayload;
  try {
    body = JSON.parse(rawBody) as PaystackPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const data = body.data;
  const eventId = data?.id !== undefined && data.id !== null
    ? String(data.id)
    : data?.reference && body.event
      ? `${body.event}:${data.reference}`
      : "";
  if (!eventId) {
    return new Response(JSON.stringify({ error: "missing event id" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const recorded = await recordWebhookEvent({
    provider: "paystack",
    eventId,
    eventType: body.event ?? null,
    signatureValid: true,
    payload: body,
  });
  if (recorded.duplicate && !recorded.retryable) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: JSON_HEADERS });
  }

  if (body.event !== "charge.success") {
    await markWebhookProcessed(recorded.id!, "ignored", "unsupported_event");
    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: JSON_HEADERS });
  }

  const reference = data?.reference?.trim();
  const amount = data?.amount;
  const currency = data?.currency?.trim();
  const transactionId = data?.id !== undefined && data.id !== null ? String(data.id) : "";
  const paidAt = data?.paid_at ? new Date(data.paid_at) : null;
  if (!data || data.status !== "success" || !reference || typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || !currency || !transactionId || !paidAt || !Number.isFinite(paidAt.getTime())) {
    await markWebhookProcessed(recorded.id!, "failed", "invalid_charge_payload");
    return new Response(JSON.stringify({ error: "invalid charge payload" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const payment = await convergePaystackWebhook({
      reference,
      providerTransactionId: transactionId,
      amount,
      currency,
      paidAt,
      paymentMethod: data.channel ?? null,
    });
    if (!payment) {
      await markWebhookProcessed(recorded.id!, "ignored", "unknown_or_already_processed_reference");
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: JSON_HEADERS });
    }
    await markWebhookProcessed(recorded.id!, "processed");
    return new Response(JSON.stringify({ ok: true, paymentId: payment.id }), { headers: JSON_HEADERS });
  } catch (error) {
    await markWebhookProcessed(
      recorded.id!,
      "failed",
      error instanceof PaymentVerificationError ? error.message : "processing_error",
    );
    return new Response(JSON.stringify({ error: "payment processing failed" }), {
      status: error instanceof PaymentVerificationError ? 400 : 500,
      headers: JSON_HEADERS,
    });
  }
}
