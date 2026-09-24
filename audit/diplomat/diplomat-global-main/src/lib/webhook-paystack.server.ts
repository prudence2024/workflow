/**
 * Paystack Webhook Handler — delegates to shared payment finalization service.
 * Handles charge.success (financial finalization) and refund.* lifecycle events
 * (provider-authoritative refund state, idempotent, out-of-order tolerant).
 */
import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";
import { z } from "zod";
import { finalizePayment } from "./payment-finalize.server";
import { applyRefundLifecycleEvent } from "./refund-lifecycle.server";

/**
 * Paystack webhook signature validation (defense-in-depth).
 * Primary validation runs in the route handler before this function is called.
 * Uses PAYSTACK_SECRET_KEY (the same key used for API calls).
 * Paystack computes: HMAC-SHA512(raw_body, secret_key)
 * There is no separate "webhook secret" in Paystack.
 */
function validateSignature(payload: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret || !signature || typeof payload !== "string") return false;
  const hmac = crypto.createHmac("sha512", secret);
  hmac.update(payload);
  const expected = hmac.digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

export const processPaystackWebhook = createServerFn({ method: "POST" })
  .validator(z.object({ body: z.string(), signature: z.string() }))
  .handler(async ({ data }) => {
    // Validate signature
    if (!validateSignature(data.body, data.signature)) {
      console.error("[webhook] Invalid Paystack signature");
      return { ok: false as const, message: "Invalid signature" };
    }

    let event: {
      event?: string;
      data?: {
        reference?: string;
        transaction_reference?: string;
        [key: string]: unknown;
      };
    };
    try {
      event = JSON.parse(data.body);
    } catch {
      return { ok: false as const, message: "Invalid JSON" };
    }

    const { event: eventType, data: payload } = event;
    console.log(
      `[webhook] Event: ${eventType}, ref: ${payload?.reference ?? payload?.transaction_reference ?? "-"}`,
    );

    if (eventType === "charge.success") {
      const reference = payload?.reference;
      if (!reference || typeof reference !== "string") {
        return { ok: false as const, message: "Missing reference" };
      }
      // Delegate to shared finalization service
      const result = await finalizePayment(reference);
      return { ok: result.ok, message: result.message };
    }

    if (eventType?.startsWith("refund.")) {
      // Refund lifecycle: pending | processing | processed | failed | needs-attention.
      // Provider state is authoritative; application never invents refund truth.
      const result = await applyRefundLifecycleEvent(
        eventType,
        (payload ?? {}) as { id?: number | string; amount?: number },
      );
      return { ok: result.ok, message: result.message };
    }

    return { ok: true as const, message: `Ignored: ${eventType}` };
  });
