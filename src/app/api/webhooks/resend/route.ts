import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  applySuppressionFromEvent,
  markWebhookProcessed,
  recordMessageEvent,
  recordWebhookEvent,
  verifyResendSignature,
} from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * POST /api/webhooks/resend
 *
 * Signature verification happens on the RAW body before any parsing or
 * business logic. Unverified payloads are recorded as invalid, never applied.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response(JSON.stringify({ error: "cannot read body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const verdict = verifyResendSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SIGNING_SECRET,
  );

  let body: {
    type?: string;
    data?: { email_id?: string; to?: string[]; bounce?: { type?: string } };
  } = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    /* recorded below as unparsable */
  }

  const eventId = request.headers.get("svix-id") ?? body.data?.email_id ?? "";
  if (!eventId) {
    return new Response(JSON.stringify({ error: "missing event id" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const recorded = await recordWebhookEvent({
    provider: "resend",
    eventId,
    eventType: body.type ?? null,
    signatureValid: verdict.valid,
    payload: body,
  });

  if (!verdict.valid) {
    await markWebhookProcessed(recorded.id!, "failed", verdict.reason ?? "invalid_signature");
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  if (recorded.duplicate) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: JSON_HEADERS });
  }

  try {
    const providerMessageId = body.data?.email_id ?? null;
    const eventType = body.type ?? "unknown";

    const message = providerMessageId
      ? await db.transaction(async (tx) => {
          await tx.execute(sql`set local role workflow_worker`);
          const res = await tx.execute<{ id: string; org_id: string }>(sql`
            select id, org_id from public.messages
             where provider_message_id = ${providerMessageId}
             limit 1
          `);
          return res.rows[0] ?? null;
        })
      : null;

    if (!message) {
      // Accepted by us but unknown to us: record and ignore, never invent.
      await markWebhookProcessed(recorded.id!, "ignored", "unknown_provider_message_id");
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: JSON_HEADERS });
    }

    // Provider evidence only. "delivered"/"bounced" are recorded as reported.
    await recordMessageEvent({
      orgId: message.org_id,
      messageId: message.id,
      provider: "resend",
      providerEventId: `${eventId}:${eventType}`,
      status: eventType,
      detail: body.data?.bounce?.type ?? null,
      rawMetadata: body as Record<string, unknown>,
    });

    const isComplaint = eventType === "email.complained";
    const isPermanentBounce =
      eventType === "email.bounced" && body.data?.bounce?.type === "Permanent";
    const isUnsubscribe = eventType === "email.unsubscribed";

    const recipient = body.data?.to?.[0];
    if ((isComplaint || isPermanentBounce || isUnsubscribe) && recipient) {
      await applySuppressionFromEvent({
        orgId: message.org_id,
        channel: "email",
        address: recipient,
        reason: isComplaint ? "complaint" : isUnsubscribe ? "unsubscribe" : "bounce",
      });
    }

    await markWebhookProcessed(recorded.id!, "processed");
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  } catch (err) {
    await markWebhookProcessed(
      recorded.id!,
      "failed",
      err instanceof Error ? err.message : "processing_error",
    );
    // 500 lets the provider retry; the (provider, event_id) dedupe makes that safe.
    return new Response(JSON.stringify({ error: "processing failed" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
