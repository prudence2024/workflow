/**
 * Paystack Webhook API Endpoint
 *
 * POST /api/webhook/paystack
 *
 * Paystack sends webhook events here after payment.
 * We validate the HMAC-SHA512 signature, then process the event.
 *
 * Security: Signature validation runs BEFORE any framework invocation
 * to prevent timing attacks and ensure invalid signatures never reach
 * business logic. Uses crypto.timingSafeEqual with length pre-check.
 */
import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { processPaystackWebhook } from "@/lib/webhook-paystack.server";

/**
 * Validate Paystack HMAC-SHA512 signature using timing-safe comparison.
 * Returns false for missing/empty/malformed signatures without throwing.
 */
function validatePaystackSignature(payload: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret || !signature || typeof payload !== "string") return false;

  const hmac = crypto.createHmac("sha512", secret);
  hmac.update(payload);
  const expected = hmac.digest(); // Buffer (binary, not hex)

  // Paystack sends hex-encoded signature; decode to Buffer for comparison
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  // Length mismatch → reject immediately (avoids timingSafeEqual RangeError)
  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export const Route = createFileRoute("/api/webhook/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Read raw body FIRST (before any framework invocation)
        let body: string;
        try {
          body = await request.text();
        } catch {
          return new Response(JSON.stringify({ error: "Cannot read request body" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }

        // 2. Extract signature header
        const signature = request.headers.get("x-paystack-signature") || "";

        // 3. Validate signature OUTSIDE createServerFn — never let invalid
        //    signatures reach the server function framework pipeline
        if (!validatePaystackSignature(body, signature)) {
          console.warn("[webhook] Rejected: invalid or missing Paystack signature");
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }

        // 4. Signature valid — delegate event processing to server function
        try {
          const result = await processPaystackWebhook({
            data: { body, signature },
          });

          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: JSON_HEADERS,
          });
        } catch (error) {
          // Server function failure after valid signature — log but return
          // 400 (not 500) to avoid leaking internal error details
          console.error("[webhook] Event processing error:", error);
          return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }
      },
    },
  },
});
