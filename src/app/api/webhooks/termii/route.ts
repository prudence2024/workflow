import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  applySuppressionFromEvent,
  markWebhookProcessed,
  recordMessageEvent,
  recordWebhookEvent,
  verifySharedSecret,
} from "@/lib/webhooks";
import { safeErrorDiagnostic } from "@/lib/diagnostics";
import { readWebhookBody, WebhookBodyTooLargeError } from "@/lib/webhookBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * POST /api/webhooks/termii — SMS delivery callbacks.
 *
 * HONEST STATUS: Termii's current documented signing scheme has not been
 * verified against their live documentation, so this route uses a shared
 * secret header (constant-time compared) as an explicit stopgap. Until the
 * documented scheme is confirmed, treat this as "authenticated by shared
 * secret", not as full provider signature verification.
 */
export async function POST(request: Request) {
  const provided =
    request.headers.get("x-termii-signature") ?? request.headers.get("x-webhook-secret");
  const valid = verifySharedSecret(provided, process.env.TERMII_WEBHOOK_SECRET);

  let body: {
    message_id?: string;
    status?: string;
    to?: string;
    reason?: string;
  } = {};
  try {
    const rawBody = await readWebhookBody(request);
    body = JSON.parse(rawBody) as typeof body;
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return new Response(JSON.stringify({ error: "payload too large" }), { status: 413, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const eventId = body.message_id ?? "";
  if (!eventId) {
    return new Response(JSON.stringify({ error: "missing message id" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const recorded = await recordWebhookEvent({
    provider: "termii",
    eventId,
    eventType: body.status ?? null,
    signatureValid: valid,
    payload: body,
  });

  if (!valid) {
    await markWebhookProcessed(recorded.id!, "failed", "invalid_shared_secret");
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  if (recorded.duplicate && !recorded.retryable) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: JSON_HEADERS });
  }

  try {
    const message = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role workflow_worker`);
      const res = await tx.execute<{ id: string; org_id: string }>(sql`
        select id, org_id from public.messages
         where provider = 'termii'
           and provider_message_id = ${eventId}
         limit 1
      `);
      return res.rows[0] ?? null;
    });

    if (!message) {
      await markWebhookProcessed(recorded.id!, "ignored", "unknown_provider_message_id");
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: JSON_HEADERS });
    }

    await recordMessageEvent({
      orgId: message.org_id,
      messageId: message.id,
      provider: "termii",
      providerEventId: eventId,
      status: body.status ?? "unknown",
      detail: body.reason ?? null,
      rawMetadata: body as Record<string, unknown>,
    });

    // Undeliverable/invalid numbers must stop future sends to that number.
    const reason = (body.reason ?? "").toLowerCase();
    const status = (body.status ?? "").toLowerCase();
    if (body.to && (status === "failed" || reason.includes("invalid") || reason.includes("dnd"))) {
      await applySuppressionFromEvent({
        orgId: message.org_id,
        channel: "sms",
        address: body.to,
        reason: reason.includes("invalid") ? "invalid" : "bounce",
      });
    }

    await markWebhookProcessed(recorded.id!, "processed");
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  } catch (err) {
    await markWebhookProcessed(recorded.id!, "failed", safeErrorDiagnostic(err).safeMessage);
    return new Response(JSON.stringify({ error: "processing failed" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
