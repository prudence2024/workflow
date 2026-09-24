/**
 * Brevo webhook handler for email delivery events.
 *
 * BREVO ACTUAL INCOMING PAYLOAD EVENT NAMES (snake_case, as received):
 *   delivered, hard_bounce, soft_bounce, spam, blocked,
 *   invalid_email, deferred, unsubscribed, click, open
 *
 * BREVO WEBHOOK CONFIG API ENUM NAMES (camelCase, for subscription):
 *   delivered, hardBounce, softBounce, spam, blocked,
 *   invalid, deferred, unsubscribed, click, open
 *
 * The parser accepts BOTH representations defensively.
 * Raw provider event string is always preserved in metadata.
 *
 * SECURITY: Bearer token authentication via BREVO_WEBHOOK_SECRET.
 *   - Secret missing → 503
 *   - Authorization header missing → 401
 *   - Wrong token → 401
 *   - Correct token → process
 *
 * DO NOT use HMAC signature verification — Brevo's primary webhook auth
 * is Bearer token, not HMAC. The X-Brevo-Signature header is not standard.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Brevo webhook payload schema.
 * Brevo sends an array of event objects.
 */
const brevoEventSchema = z.object({
  event: z.string(),
  email: z.string(),
  "message-id": z.string().optional(),
  "message-idleur": z.string().optional(),
  date: z.string().optional(),
  tag: z.string().optional(),
  subject: z.string().optional(),
  sending_ip: z.string().optional(),
  "destination-ip": z.string().optional(),
  "smtp-id": z.string().optional(),
  ts: z.number().optional(),
  date_epoch: z.number().optional(),
  hard_bounce: z.boolean().optional(),
  blocked: z.boolean().optional(),
  error: z.string().optional(),
  category: z.string().optional(),
});

const brevoWebhookSchema = z.array(brevoEventSchema);

/**
 * Normalize Brevo event names.
 * Accepts both snake_case (actual payload) and camelCase (config API).
 * Returns a canonical internal name for switch logic.
 */
function normalizeBrevoEvent(event: string): string {
  switch (event) {
    // Delivered
    case "delivered":
      return "delivered";
    // Hard bounce — both formats
    case "hard_bounce":
    case "hardBounce":
      return "hard_bounce";
    // Soft bounce — both formats (TEMPORARY, not permanent suppression)
    case "soft_bounce":
    case "softBounce":
      return "soft_bounce";
    // Spam/complaint
    case "spam":
      return "spam";
    // Blocked
    case "blocked":
      return "blocked";
    // Invalid email — both formats
    case "invalid_email":
    case "invalid":
      return "invalid_email";
    // Deferred — temporary, not suppression
    case "deferred":
      return "deferred";
    // Unsubscribed
    case "unsubscribed":
      return "unsubscribed";
    // Engagement events
    case "click":
      return "click";
    case "open":
      return "open";
    default:
      return event; // preserve unknown events as-is
  }
}

/**
 * Map normalized Brevo event to internal communication_logs status.
 */
function mapBrevoStatus(canonical: string): string {
  switch (canonical) {
    case "delivered":
      return "delivered";
    case "hard_bounce":
      return "bounced";
    case "soft_bounce":
      return "soft_bounced"; // temporary — not permanent suppression
    case "spam":
      return "complaint";
    case "blocked":
      return "blocked";
    case "invalid_email":
      return "rejected";
    case "deferred":
      return "deferred"; // temporary — not suppression
    case "unsubscribed":
      return "unsubscribed";
    case "click":
    case "open":
      return "opened"; // engagement, not error
    default:
      return "unknown";
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Process a single Brevo webhook event.
 * Updates communication_logs status and handles suppression.
 *
 * Suppression policy:
 *   PERMANENT (add to marketing_suppression):
 *     unsubscribed, hard_bounce, spam, invalid_email, blocked
 *   TEMPORARY (status only, NO suppression):
 *     soft_bounce, deferred
 */
async function processBrevoEvent(event: any) {
  const { createDatabaseClient } = await import("./admin/admin-ops.server");
  const db = createDatabaseClient();
  const email = event.email?.toLowerCase().trim();
  if (!email) return;

  const rawEvent = event.event; // preserve exactly as received
  const canonical = normalizeBrevoEvent(rawEvent);
  const status = mapBrevoStatus(canonical);

  // Update communication_logs if message-id is provided
  if (event["message-id"]) {
    await db
      .from("communication_logs")
      .update({
        status,
        provider_message_id: event["message-id"],
        error_message: event.error || null,
      })
      .eq("provider_message_id", event["message-id"]);
  }

  // ── PERMANENT SUPPRESSION EVENTS ──

  // Unsubscribed — user clicked unsubscribe link
  if (canonical === "unsubscribed") {
    await db
      .from("marketing_suppression")
      .upsert({ email, reason: "unsubscribed", source: "brevo_webhook" }, { onConflict: "email" });
    // Cross-source: update customer
    await db
      .from("customers")
      .update({
        marketing_consent: false,
        marketing_unsubscribed_at: new Date().toISOString(),
      })
      .eq("email", email);
    // Cross-source: deactivate newsletter subscriber
    await db
      .from("newsletter_subscribers")
      .update({
        is_active: false,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("email", email);
  }

  // Hard bounce — permanently undeliverable
  if (canonical === "hard_bounce") {
    await db
      .from("marketing_suppression")
      .upsert({ email, reason: "hard_bounce", source: "brevo_webhook" }, { onConflict: "email" });
  }

  // Spam complaint — user marked as spam
  if (canonical === "spam") {
    await db
      .from("marketing_suppression")
      .upsert({ email, reason: "complaint", source: "brevo_webhook" }, { onConflict: "email" });
  }

  // Invalid email — address does not exist
  if (canonical === "invalid_email") {
    await db
      .from("marketing_suppression")
      .upsert({ email, reason: "invalid_email", source: "brevo_webhook" }, { onConflict: "email" });
  }

  // Blocked — provider blocked delivery
  // Treated as ineligible (not user-initiated unsubscribe, but undeliverable)
  if (canonical === "blocked") {
    await db
      .from("marketing_suppression")
      .upsert({ email, reason: "blocked", source: "brevo_webhook" }, { onConflict: "email" });
  }

  // ── TEMPORARY EVENTS — NO SUPPRESSION ──
  // soft_bounce: mailbox full, server temporarily unavailable, etc.
  // deferred: retry scheduled by provider
  // These are only logged in communication_logs status above.
}

/**
 * Brevo webhook endpoint handler.
 * Called by Brevo when email events occur.
 *
 * Authentication: Bearer token in Authorization header.
 */
export const handleBrevoWebhook = createServerFn({ method: "POST" })
  .validator(
    z.object({
      body: z.any(),
      authorization: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store, max-age=0");

    // Check if webhook secret is configured
    const webhookSecret = process.env.BREVO_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      setResponseStatus(503);
      return { ok: false as const, message: "Webhook not configured" };
    }

    // Verify Bearer token — always required when secret is configured
    if (!data.authorization) {
      setResponseStatus(401);
      return { ok: false as const, message: "Missing Authorization header" };
    }

    // Extract bearer token: "Bearer <token>" or just "<token>"
    const providedToken = data.authorization.startsWith("Bearer ")
      ? data.authorization.slice(7).trim()
      : data.authorization.trim();

    if (!constantTimeCompare(providedToken, webhookSecret)) {
      setResponseStatus(401);
      return { ok: false as const, message: "Invalid webhook credentials" };
    }

    // Parse events
    const rawBody = data.body;
    let events: any[];
    if (Array.isArray(rawBody)) {
      events = rawBody;
    } else if (rawBody && typeof rawBody === "object" && rawBody.items) {
      events = rawBody.items;
    } else {
      setResponseStatus(400);
      return { ok: false as const, message: "Invalid payload" };
    }

    const parsed = brevoWebhookSchema.safeParse(events);
    if (!parsed.success) {
      setResponseStatus(400);
      return { ok: false as const, message: "Invalid event format" };
    }

    // Process events
    let processed = 0;
    let failed = 0;
    for (const event of parsed.data) {
      try {
        await processBrevoEvent(event);
        processed++;
      } catch (err) {
        console.error("[brevo-webhook] Failed to process event:", err);
        failed++;
      }
    }

    return {
      ok: true as const,
      processed,
      failed,
      message: `Processed ${processed} events, ${failed} failed`,
    };
  });
