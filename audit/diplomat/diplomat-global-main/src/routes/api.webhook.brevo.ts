import { createFileRoute } from "@tanstack/react-router";
import { handleBrevoWebhook } from "@/lib/brevo-webhook.server";

/**
 * Brevo webhook endpoint.
 *
 * POST /api/webhook/brevo
 *
 * Brevo sends email delivery events here. Configure this URL in your
 * Brevo dashboard under Settings → Webhooks.
 *
 * Supported events (both snake_case and camelCase accepted):
 * - delivered, hard_bounce/hardBounce, soft_bounce/softBounce
 * - spam, blocked, invalid_email/invalid, deferred
 * - unsubscribed, click, open
 *
 * Security:
 * - BREVO_WEBHOOK_SECRET must be configured as server env var
 * - Authorization: Bearer <secret> required on every request
 * - Returns 503 if secret not configured
 * - Returns 401 if Authorization missing or wrong
 */

export const Route = createFileRoute("/api/webhook/brevo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const authorization = request.headers.get("authorization") || undefined;

          const result = await handleBrevoWebhook({
            data: { body, authorization },
          });

          const status = result.ok ? 200 : result.message === "Webhook not configured" ? 503 : 401;
          return new Response(JSON.stringify(result), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[brevo-webhook] Handler error:", err);
          return new Response(JSON.stringify({ ok: false, message: "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
  component: () => null,
});
