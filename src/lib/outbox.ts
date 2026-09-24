import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TenantTx } from "@/lib/tenant";

/**
 * Durable outbox.
 *
 * Adapted from the Diplomat Global pattern (see the audit), with two changes
 * that matter on Neon: the queue is organisation-scoped, and the worker runs as
 * the restricted `workflow_worker` role rather than a service-role key.
 *
 * Guarantees:
 *   - enqueue is idempotent on `idempotency_key` (a retried request cannot
 *     duplicate a send);
 *   - claiming uses FOR UPDATE SKIP LOCKED, so concurrent workers never
 *     double-process an event;
 *   - an uncertain provider outcome becomes `ambiguous` and is NEVER retried
 *     automatically — a human decides;
 *   - retries use exponential backoff and stop at `max_attempts`;
 *   - a provider that is not configured yields `skipped`, never `sent`.
 */

export type OutboxEventType = "email" | "sms" | "telegram";
export type OutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "exhausted"
  | "ambiguous";

export type OutboxRow = {
  id: string;
  org_id: string | null;
  event_type: OutboxEventType;
  idempotency_key: string;
  provider: string;
  attempt_count: number;
  max_attempts: number;
  status: OutboxStatus;
  payload: Record<string, unknown>;
};

export type DispatchResult =
  | { outcome: "sent"; providerMessageId?: string }
  | { outcome: "failed"; error: string; retryable: boolean }
  | { outcome: "ambiguous"; error: string }
  | { outcome: "skipped"; reason: string };

export type EnqueueInput = {
  orgId: string | null;
  eventType: OutboxEventType;
  /** Stable, caller-supplied key. Re-sending the same logical message must reuse it. */
  idempotencyKey: string;
  provider: string;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
};

/**
 * Enqueue inside an existing tenant transaction so the queue write commits with
 * the business change that caused it.
 */
export async function enqueueEvent(
  tx: TenantTx,
  input: EnqueueInput,
): Promise<{ id: string; enqueued: boolean }> {
  const res = await tx.execute<{ id: string }>(sql`
    insert into public.outbox_events
      (org_id, event_type, idempotency_key, provider, resource_type, resource_id, payload, max_attempts)
    values (
      ${input.orgId}::uuid,
      ${input.eventType},
      ${input.idempotencyKey},
      ${input.provider},
      ${input.resourceType ?? null},
      ${input.resourceId ?? null}::uuid,
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      ${input.maxAttempts ?? 5}
    )
    on conflict (idempotency_key) do nothing
    returning id
  `);

  if (res.rows.length > 0) return { id: res.rows[0].id, enqueued: true };

  const existing = await tx.execute<{ id: string }>(
    sql`select id from public.outbox_events where idempotency_key = ${input.idempotencyKey}`,
  );
  return { id: existing.rows[0]?.id ?? "", enqueued: false };
}

/** Claim a batch of due events for a worker. Runs as the restricted worker role. */
export async function claimEvents(workerId: string, limit = 10): Promise<OutboxRow[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role workflow_worker`);
    const res = await tx.execute<OutboxRow>(sql`
      update public.outbox_events
         set status = 'processing',
             locked_at = now(),
             locked_by = ${workerId},
             attempt_count = attempt_count + 1,
             updated_at = now()
       where id in (
         select id from public.outbox_events
          where status in ('pending', 'failed')
            and next_attempt_at <= now()
          order by next_attempt_at
          limit ${limit}
          for update skip locked
       )
      returning id, org_id, event_type, idempotency_key, provider, attempt_count, max_attempts, status, payload
    `);
    return res.rows;
  });
}

export async function markSent(id: string, providerMessageId?: string): Promise<void> {
  await db.execute(sql`
    update public.outbox_events
       set status = 'sent', provider_message_id = ${providerMessageId ?? null},
           sent_at = now(), updated_at = now(), locked_at = null, locked_by = null, last_error = null
     where id = ${id}::uuid
  `);
}

/** Retryable failure: back off, or exhaust once max_attempts is reached. */
export async function markFailed(id: string, error: string): Promise<void> {
  await db.execute(sql`
    update public.outbox_events
       set status = case when attempt_count >= max_attempts then 'exhausted' else 'failed' end,
           last_error = ${error.slice(0, 800)},
           next_attempt_at = now() + (interval '5 seconds' * power(2, least(attempt_count, 8))),
           updated_at = now(),
           locked_at = null,
           locked_by = null
     where id = ${id}::uuid
  `);
}

/**
 * Uncertain outcome (timeout, connection reset after the request was sent).
 * The provider may or may not have accepted the message, so this must never be
 * auto-retried and must never be shown as delivered.
 */
export async function markAmbiguous(id: string, error: string): Promise<void> {
  await db.execute(sql`
    update public.outbox_events
       set status = 'ambiguous',
           last_error = ${error.slice(0, 800)},
           updated_at = now(),
           locked_at = null,
           locked_by = null
     where id = ${id}::uuid
  `);
}

export type DispatchFn = (row: OutboxRow) => Promise<DispatchResult>;

/** Process one batch. Returns per-outcome counts for honest reporting. */
export async function processOutboxBatch(
  workerId: string,
  dispatch: DispatchFn,
  limit = 10,
): Promise<Record<DispatchResult["outcome"] | "error", number>> {
  const rows = await claimEvents(workerId, limit);
  const tally = { sent: 0, failed: 0, ambiguous: 0, skipped: 0, error: 0 };

  for (const row of rows) {
    try {
      const result = await dispatch(row);
      if (result.outcome === "sent") {
        await markSent(row.id, result.providerMessageId);
      } else if (result.outcome === "ambiguous") {
        await markAmbiguous(row.id, result.error);
      } else if (result.outcome === "skipped") {
        // Not a provider failure: release the row without burning retries.
        await db.execute(sql`
          update public.outbox_events
             set status = 'pending', next_attempt_at = now() + interval '10 minutes',
                 last_error = ${`skipped: ${result.reason}`}, updated_at = now(),
                 attempt_count = greatest(attempt_count - 1, 0),
                 locked_at = null, locked_by = null
           where id = ${row.id}::uuid
        `);
      } else {
        await markFailed(row.id, result.error);
      }
      tally[result.outcome] += 1;
    } catch (err) {
      // A throw after the provider call started is ambiguous by definition.
      await markAmbiguous(row.id, err instanceof Error ? err.message : "unknown dispatch error");
      tally.error += 1;
    }
  }

  return tally;
}

// ---------------------------------------------------------------------------
// Send eligibility: permission, consent and suppression are gates, not advice
// ---------------------------------------------------------------------------

export type IneligibleReason =
  | "no_consent"
  | "suppressed"
  | "missing_address"
  | "contact_not_found";

export type Eligibility =
  | { eligible: true; address: string }
  | { eligible: false; reason: IneligibleReason };

/**
 * Decide whether a bulk/transactional message may be sent to a contact.
 * Absence of consent is NOT consent. Suppression always wins.
 */
export async function evaluateSendEligibility(
  tx: TenantTx,
  params: { orgId: string; contactId: string; channel: "email" | "sms" },
): Promise<Eligibility> {
  const contact = await tx.execute<{ email: string | null; phone: string | null }>(sql`
    select email, phone from public.contacts
     where id = ${params.contactId}::uuid and org_id = ${params.orgId}::uuid
  `);
  if (contact.rows.length === 0) return { eligible: false, reason: "contact_not_found" };

  const address =
    params.channel === "email" ? contact.rows[0].email : contact.rows[0].phone;
  if (!address || address.trim() === "") return { eligible: false, reason: "missing_address" };

  const suppression = await tx.execute<{ id: string }>(sql`
    select id from public.suppression_entries
     where org_id = ${params.orgId}::uuid
       and channel = ${params.channel}
       and lower(address) = lower(${address})
     limit 1
  `);
  if (suppression.rows.length > 0) return { eligible: false, reason: "suppressed" };

  const consent = await tx.execute<{ id: string }>(sql`
    select id from public.contact_channel_consents
     where org_id = ${params.orgId}::uuid
       and contact_id = ${params.contactId}::uuid
       and channel = ${params.channel}
       and status = 'granted'
     limit 1
  `);
  if (consent.rows.length === 0) return { eligible: false, reason: "no_consent" };

  return { eligible: true, address };
}

export async function addSuppression(
  tx: TenantTx,
  params: { orgId: string; channel: "email" | "sms"; address: string; reason: string },
): Promise<void> {
  await tx.execute(sql`
    insert into public.suppression_entries (org_id, channel, address, reason)
    values (${params.orgId}::uuid, ${params.channel}, lower(${params.address}), ${params.reason})
    on conflict (org_id, channel, address) do nothing
  `);
}

// ---------------------------------------------------------------------------
// Provider adapters — honest outcomes only
// ---------------------------------------------------------------------------

export async function dispatchEmail(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<DispatchResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  // A missing key is a configuration gap, never a delivered message.
  if (!apiKey || !from) return { outcome: "skipped", reason: "email_provider_not_configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status >= 500) {
      return { outcome: "failed", error: `resend_${res.status}`, retryable: true };
    }
    if (!res.ok) {
      const text = await res.text();
      return { outcome: "failed", error: `resend_${res.status}: ${text.slice(0, 300)}`, retryable: false };
    }
    const data = (await res.json()) as { id?: string };
    return { outcome: "sent", providerMessageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // A timeout or reset may have reached the provider: uncertain, not failed.
    return { outcome: "ambiguous", error: `resend_uncertain: ${message}` };
  }
}

export async function dispatchSms(payload: {
  to: string;
  body: string;
}): Promise<DispatchResult> {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  const baseUrl = process.env.TERMII_BASE_URL ?? "https://api.ng.termii.com";
  if (!apiKey || !senderId) return { outcome: "skipped", reason: "sms_provider_not_configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${baseUrl}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: payload.to,
        from: senderId,
        sms: payload.body,
        type: "unicode",
        channel: "generic",
        api_key: apiKey,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status >= 500) return { outcome: "failed", error: `termii_${res.status}`, retryable: true };
    if (!res.ok) {
      const text = await res.text();
      return { outcome: "failed", error: `termii_${res.status}: ${text.slice(0, 300)}`, retryable: false };
    }
    const data = (await res.json()) as { message_id?: string };
    return { outcome: "sent", providerMessageId: data.message_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { outcome: "ambiguous", error: `termii_uncertain: ${message}` };
  }
}

export async function dispatchTelegram(payload: {
  chatId: string;
  text: string;
}): Promise<DispatchResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { outcome: "skipped", reason: "telegram_not_configured" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: payload.chatId, text: payload.text, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      return { outcome: "failed", error: `telegram_${res.status}`, retryable: res.status >= 500 };
    }
    const data = (await res.json()) as { result?: { message_id?: number } };
    return { outcome: "sent", providerMessageId: String(data.result?.message_id ?? "") };
  } catch (err) {
    return {
      outcome: "ambiguous",
      error: `telegram_uncertain: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function dispatchByType(row: OutboxRow): Promise<DispatchResult> {
  const payload = row.payload ?? {};
  if (row.event_type === "email") {
    return dispatchEmail({
      to: String(payload.to ?? ""),
      subject: String(payload.subject ?? ""),
      html: String(payload.html ?? ""),
    });
  }
  if (row.event_type === "sms") {
    return dispatchSms({ to: String(payload.to ?? ""), body: String(payload.body ?? "") });
  }
  return dispatchTelegram({
    chatId: String(payload.chatId ?? ""),
    text: String(payload.text ?? ""),
  });
}
