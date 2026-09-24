/**
 * Durable outbox behaviour against a REAL PostgreSQL branch.
 *
 * Covers the properties that make dispatch trustworthy: a repeated enqueue is
 * idempotent, a claimed event is not claimable again, retries back off and
 * exhaust, and an uncertain outcome is parked as `ambiguous` instead of being
 * retried or reported as delivered.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./setup";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const suite = hasDatabase ? describe : describe.skip;
const runId = randomUUID().slice(0, 8);

let client: pg.Client;
const keys: string[] = [];

function key(label: string): string {
  const k = `test-outbox-${runId}-${label}`;
  keys.push(k);
  return k;
}

suite("durable outbox (real PostgreSQL)", () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("delete from public.outbox_events where idempotency_key = any($1::text[])", [
      keys,
    ]);
    await client.end().catch(() => {});
  });

  async function enqueue(idempotencyKey: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await client.query(
      `insert into public.outbox_events
         (org_id, event_type, idempotency_key, provider, payload, status, max_attempts, next_attempt_at)
       values (null, $2, $1, $3, '{}'::jsonb, $4, $5, $6)
       on conflict (idempotency_key) do nothing
       returning id`,
      [
        idempotencyKey,
        overrides.eventType ?? "email",
        overrides.provider ?? "resend",
        overrides.status ?? "pending",
        overrides.maxAttempts ?? 5,
        overrides.nextAttemptAt ?? new Date(Date.now() - 1000),
      ],
    );
    return res.rows[0]?.id as string | undefined;
  }

  it("rejects a duplicate idempotency key (a retried request cannot double-send)", async () => {
    const k = key("dup");
    const first = await enqueue(k);
    const second = await enqueue(k);
    expect(first).toBeTruthy();
    expect(second).toBeUndefined();

    const count = await client.query(
      "select count(*)::int as n from public.outbox_events where idempotency_key = $1",
      [k],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("claims a due event exactly once and increments attempts", async () => {
    const k = key("claim");
    await enqueue(k);

    const claim = async () =>
      client.query(
        `update public.outbox_events
            set status = 'processing', attempt_count = attempt_count + 1, locked_by = $2, locked_at = now()
          where id in (
            select id from public.outbox_events
             where status in ('pending','failed') and next_attempt_at <= now() and idempotency_key = $1
             for update skip locked
          )
        returning id, attempt_count, status`,
        [k, "worker-test"],
      );

    const firstClaim = await claim();
    expect(firstClaim.rowCount).toBe(1);
    expect(firstClaim.rows[0].attempt_count).toBe(1);

    // Already processing: a second worker must not pick it up again.
    const secondClaim = await claim();
    expect(secondClaim.rowCount).toBe(0);
  });

  it("backs off a retryable failure and exhausts at max_attempts", async () => {
    const k = key("retry");
    await enqueue(k, { maxAttempts: 2, eventType: "sms", provider: "termii" });

    await client.query(
      `update public.outbox_events
          set status = case when attempt_count + 1 >= max_attempts then 'exhausted' else 'failed' end,
              attempt_count = attempt_count + 1,
              next_attempt_at = now() + (interval '5 seconds' * power(2, least(attempt_count + 1, 8)))
        where idempotency_key = $1`,
      [k],
    );

    // First failure: still retryable, scheduled in the future.
    let row = await client.query(
      "select status, attempt_count, (next_attempt_at > now()) as scheduled_ahead from public.outbox_events where idempotency_key = $1",
      [k],
    );
    expect(row.rows[0].status).toBe("failed");
    expect(row.rows[0].scheduled_ahead).toBe(true);

    // Not due yet, so it must not be claimable.
    const notDue = await client.query(
      "select count(*)::int as n from public.outbox_events where idempotency_key = $1 and next_attempt_at <= now()",
      [k],
    );
    expect(notDue.rows[0].n).toBe(0);

    await client.query(
      `update public.outbox_events
          set status = case when attempt_count + 1 >= max_attempts then 'exhausted' else 'failed' end,
              attempt_count = attempt_count + 1
        where idempotency_key = $1`,
      [k],
    );
    row = await client.query(
      "select status, attempt_count from public.outbox_events where idempotency_key = $1",
      [k],
    );
    expect(row.rows[0].status).toBe("exhausted");
  });

  it("parks an uncertain outcome as ambiguous and never auto-retries it", async () => {
    const k = key("ambiguous");
    await enqueue(k);

    await client.query(
      `update public.outbox_events
          set status = 'ambiguous', last_error = 'provider timeout after request was sent'
        where idempotency_key = $1`,
      [k],
    );

    const row = await client.query(
      "select status from public.outbox_events where idempotency_key = $1",
      [k],
    );
    expect(row.rows[0].status).toBe("ambiguous");

    // The claim predicate must never select ambiguous rows.
    const claimable = await client.query(
      "select count(*)::int as n from public.outbox_events where idempotency_key = $1 and status in ('pending','failed')",
      [k],
    );
    expect(claimable.rows[0].n).toBe(0);
  });

  it("constrains the status vocabulary at the database level", async () => {
    const k = key("bad-status");
    await expect(
      client.query(
        `insert into public.outbox_events (event_type, idempotency_key, provider, status)
         values ('email', $1, 'resend', 'certainly_delivered')`,
        [k],
      ),
    ).rejects.toThrow(/outbox_status_check/);
  });
});
