import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatchByType, processOutboxBatch, type OutboxRow } from "@/lib/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbox dispatcher.
 *
 * This is the durable-queue consumer. It is deliberately an HTTP endpoint rather
 * than a long-lived process so the same code can be driven by Trigger.dev, a
 * cron, or a local script — and so it can be exercised by tests without a
 * worker daemon.
 *
 * Contract:
 *   POST /api/worker/outbox
 *   Authorization: Bearer $WORKER_SECRET
 *   body (optional): { "limit": 10 }
 *
 * The endpoint never reports a delivery it did not observe. A provider that is
 * not configured produces `skipped`; a timeout produces `ambiguous` and the row
 * is parked for a human.
 */

function authorised(request: Request): boolean {
  const secret = process.env.WORKER_SECRET;
  // Fail closed: with no secret configured, nothing may drain the queue remotely.
  if (!secret || secret.trim() === "") return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let limit = 10;
  try {
    const body = (await request.json()) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(Math.trunc(body.limit), 1), 50);
    }
  } catch {
    // An empty body is valid: use the default batch size.
  }

  const workerId = `http:${process.env.WORKER_ID ?? "default"}`;

  const tally = await processOutboxBatch(
    workerId,
    async (row: OutboxRow) => {
      const result = await dispatchByType(row);

      // Record what the provider actually told us, in the same breath as the
      // queue transition. `accepted` is not `delivered`.
      const messageId = String(row.payload?.messageId ?? "");

      if (row.event_type !== "telegram") {
        if (messageId) {
          await db.execute(sql`
            update public.messages
               set status = ${messageStatusFor(result.outcome)},
                   provider = ${row.provider},
                   provider_message_id = ${result.outcome === "sent" ? (result.providerMessageId ?? null) : null},
                   error_message = ${result.outcome === "sent" ? null : describe(result)},
                   sent_at = ${result.outcome === "sent" ? sql`now()` : sql`sent_at`}
             where id = ${messageId}::uuid
          `);
        }

        await db.execute(sql`
          insert into public.message_events (org_id, message_id, provider, provider_event_id, status, detail)
          values (
            ${row.org_id}::uuid,
            ${messageId || null}::uuid,
            ${row.provider},
            ${result.outcome === "sent" ? (result.providerMessageId ?? null) : null},
            ${result.outcome === "sent" ? "accepted" : result.outcome},
            ${describe(result)}
          )
        `);
      }

      return result;
    },
    limit,
  );

  return Response.json({ ok: true, workerId, tally }, { status: 200 });
}

/** A message is only `sent` when the provider returned an identifier. */
function messageStatusFor(outcome: string): string {
  switch (outcome) {
    case "sent":
      return "sent";
    case "failed":
      return "failed";
    case "ambiguous":
      return "unknown";
    default:
      return "queued";
  }
}

function describe(result: { outcome: string; error?: string; reason?: string }): string | null {
  if (result.outcome === "sent") return null;
  return result.error ?? result.reason ?? result.outcome;
}

export async function GET() {
  // Never expose queue internals without the shared secret.
  return Response.json({ error: "method not allowed" }, { status: 405 });
}
