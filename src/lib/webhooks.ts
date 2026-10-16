import "server-only";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Provider webhook verification.
 *
 * Each provider signs differently, so each gets its own verifier rather than a
 * shared "check a header" helper. All comparisons are constant-time and every
 * outbound-effect path is deduplicated on (provider, event_id), so a replayed
 * delivery can never double-apply an effect.
 */

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * Resend delivers webhooks through Svix:
 *   signed content = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   signature      = base64(HMAC-SHA256(base64_decode(secret), signedContent))
 * The `svix-signature` header may carry several space-separated `v1,<sig>` values.
 */
export function verifyResendSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string | undefined,
  toleranceSeconds = 300,
): { valid: boolean; reason?: string } {
  if (!secret || secret.trim() === "") return { valid: false, reason: "secret_not_configured" };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { valid: false, reason: "missing_signature_headers" };
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "invalid_timestamp" };
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > toleranceSeconds) return { valid: false, reason: "timestamp_out_of_tolerance" };

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { valid: false, reason: "invalid_secret_encoding" };
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");

  for (const part of headers.signature.split(" ")) {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature) continue;
    if (constantTimeEqual(expected, signature)) return { valid: true };
  }

  return { valid: false, reason: "signature_mismatch" };
}

/**
 * Telegram sets X-Telegram-Bot-Api-Secret-Token to the value supplied at
 * setWebhook time. It is a shared secret, compared in constant time.
 */
export function verifyTelegramSecret(
  headerValue: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.trim() === "" || !headerValue) return false;
  return constantTimeEqual(headerValue, expected);
}

/**
 * Generic shared-secret comparison used for providers whose documented scheme
 * has not been confirmed yet. Termii must be re-checked against its current
 * documentation before production; until then this is an explicit stopgap and
 * is reported as such rather than presented as full signature verification.
 */
export function verifySharedSecret(
  provided: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.trim() === "" || !provided) return false;
  return constantTimeEqual(provided, expected);
}

/** Paystack signs the exact raw request body with HMAC-SHA512. */
export function verifyPaystackSignature(
  rawBody: string,
  provided: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.trim() === "" || !provided) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return constantTimeEqual(expected, provided.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Idempotent recording
// ---------------------------------------------------------------------------

export type RecordedWebhook = {
  duplicate: boolean;
  id: string | null;
  /** Provider retries may re-enter only after a prior processing failure. */
  retryable: boolean;
};

export function isRetryableWebhookStatus(status: string | null | undefined): boolean {
  return status === "failed";
}

/** Record a provider delivery. A repeated (provider, event_id) is a duplicate. */
export async function recordWebhookEvent(params: {
  provider: "resend" | "termii" | "telegram" | "paystack";
  eventId: string;
  eventType?: string | null;
  signatureValid: boolean;
  payload: unknown;
}): Promise<RecordedWebhook> {
  const res = await db.execute<{ id: string }>(sql`
    insert into public.webhook_events (provider, event_id, event_type, signature_valid, payload)
    values (
      ${params.provider},
      ${params.eventId},
      ${params.eventType ?? null},
      ${params.signatureValid},
      ${JSON.stringify(params.payload ?? {})}::jsonb
    )
    on conflict (provider, event_id) do nothing
    returning id
  `);

  if (res.rows.length > 0) return { duplicate: false, id: res.rows[0].id, retryable: false };

  const existing = await db.execute<{ id: string; status: string }>(sql`
    select id, status from public.webhook_events where provider = ${params.provider} and event_id = ${params.eventId}
  `);
  return {
    duplicate: true,
    id: existing.rows[0]?.id ?? null,
    retryable: isRetryableWebhookStatus(existing.rows[0]?.status),
  };
}

export async function markWebhookProcessed(
  id: string,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string,
): Promise<void> {
  await db.execute(sql`
    update public.webhook_events
       set status = ${status}, processed_at = now(), error_message = ${errorMessage ?? null}
     where id = ${id}::uuid
  `);
}

/** Attach provider delivery evidence to a message without inventing delivery. */
export async function recordMessageEvent(params: {
  orgId: string;
  messageId: string | null;
  provider: string;
  providerEventId: string | null;
  status: string;
  detail?: string | null;
  rawMetadata?: Record<string, unknown>;
}): Promise<void> {
  if (params.providerEventId) {
    // The current schema intentionally does not require a migration-level
    // unique constraint for provider evidence. Serialize the check/insert for
    // this provider event instead, so concurrent webhook deliveries cannot
    // both observe the row as absent and create duplicate evidence.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtext(${`${params.provider}:${params.providerEventId}`}))
      `);
      const dupe = await tx.execute<{ id: string }>(sql`
        select id from public.message_events
         where provider = ${params.provider} and provider_event_id = ${params.providerEventId}
         limit 1
      `);
      if (dupe.rows.length > 0) return;

      await tx.execute(sql`
        insert into public.message_events
          (org_id, message_id, provider, provider_event_id, status, detail, raw_metadata)
        values (
          ${params.orgId}::uuid,
          ${params.messageId}::uuid,
          ${params.provider},
          ${params.providerEventId},
          ${params.status},
          ${params.detail ?? null},
          ${JSON.stringify(params.rawMetadata ?? {})}::jsonb
        )
      `);
    });
    return;
  }

  await db.execute(sql`
    insert into public.message_events
      (org_id, message_id, provider, provider_event_id, status, detail, raw_metadata)
    values (
      ${params.orgId}::uuid,
      ${params.messageId}::uuid,
      ${params.provider},
      ${params.providerEventId},
      ${params.status},
      ${params.detail ?? null},
      ${JSON.stringify(params.rawMetadata ?? {})}::jsonb
    )
  `);
}

export async function applySuppressionFromEvent(params: {
  orgId: string;
  channel: "email" | "sms";
  address: string;
  reason: string;
}): Promise<void> {
  await db.execute(sql`
    insert into public.suppression_entries (org_id, channel, address, reason)
    values (${params.orgId}::uuid, ${params.channel}, lower(${params.address}), ${params.reason})
    on conflict (org_id, channel, address) do nothing
  `);
}
