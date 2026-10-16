/**
 * Real PostgreSQL payment-convergence concurrency test.
 *
 * This suite is opt-in because it creates and removes temporary rows. It must
 * be run only against the verified non-production development branch:
 *
 *   $env:RUN_PAYMENT_CONCURRENCY_TEST = "1"
 *   $env:PAYMENT_CONCURRENCY_DATABASE_URL = "<isolated-test-branch-url>"
 *   $env:PAYMENT_TEST_EXPECTED_BRANCH = "development"
 *   $env:PAYMENT_TEST_EXPECTED_BRANCH_ID = "<verified-development-branch-id>"
 *   npx vitest run tests/payment-concurrency.test.ts
 */
import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/db";
import { convergeVerifiedPayment } from "@/lib/payments";

const enabled = process.env.RUN_PAYMENT_CONCURRENCY_TEST === "1";
const suite = enabled ? describe : describe.skip;
const isolatedConnectionString = process.env.PAYMENT_CONCURRENCY_DATABASE_URL ?? "";
const expectedBranch = process.env.PAYMENT_TEST_EXPECTED_BRANCH ?? "";
const branchId = process.env.PAYMENT_TEST_EXPECTED_BRANCH_ID ?? "";
const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const orgId = crypto.randomUUID();
const paymentIds = [crypto.randomUUID(), crypto.randomUUID()];

type Identity = {
  database_name: string;
  role_name: string;
  branch_id: string | null;
};

async function readIdentity(connectionString: string): Promise<Identity> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<Identity>(`
      select current_database() as database_name,
             current_user as role_name,
             current_setting('neon.branch_id', true) as branch_id
    `);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

suite("Paystack provider transaction concurrency (real PostgreSQL)", () => {
  let owner: pg.Client | undefined;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    if (!enabled) return;
    if (!isolatedConnectionString || !expectedBranch || !branchId) {
      throw new Error("Payment concurrency test requires explicit development database safeguards");
    }
    if (expectedBranch !== "development" || process.env.NEON_BRANCH !== expectedBranch) {
      throw new Error("Payment concurrency test requires NEON_BRANCH=development");
    }

    const identity = await readIdentity(isolatedConnectionString);
    expect(identity.database_name).toBe("neondb");
    expect(identity.branch_id).toBe(branchId);
    expect(identity.role_name).not.toBe("workflow_worker");

    // The production code reads DATABASE_URL lazily. Point it at the same
    // explicitly isolated branch for this opt-in test only.
    await closePool();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = isolatedConnectionString;

    owner = new pg.Client({ connectionString: isolatedConnectionString });
    await owner.connect();
    await owner.query(
      `insert into public.organizations (id, name, slug, plan_key, workspace_type)
       values ($1::uuid, $2, $3, 'free', 'organization')`,
      [orgId, `Payment concurrency test ${suffix}`, `payment-concurrency-${suffix}`],
    );
    await owner.query(
      `insert into public.payments
        (id, org_id, provider, provider_reference, idempotency_key, plan_key, amount, currency, status)
       values
        ($1::uuid, $3::uuid, 'paystack', $4, $5, 'pro', 100000, 'NGN', 'pending'),
        ($2::uuid, $3::uuid, 'paystack', $6, $7, 'pro', 100000, 'NGN', 'pending')`,
      [
        paymentIds[0],
        paymentIds[1],
        orgId,
        `payment-concurrency-reference-a-${suffix}`,
        `payment-concurrency-idempotency-a-${suffix}`,
        `payment-concurrency-reference-b-${suffix}`,
        `payment-concurrency-idempotency-b-${suffix}`,
      ],
    );
    await owner.query(
      `insert into public.subscriptions
        (org_id, plan_key, status, requested_plan_key, billing_state)
       values ($1::uuid, 'free', 'active', 'pro', 'pending_payment')`,
      [orgId],
    );
  });

  afterAll(async () => {
    if (!enabled) return;
    try {
      if (owner) {
        await owner.query("delete from public.payments where id = any($1::uuid[])", [paymentIds]);
        await owner.query("delete from public.subscriptions where org_id = $1::uuid", [orgId]);
        await owner.query("delete from public.organizations where id = $1::uuid", [orgId]);
        const remaining = await owner.query<{ count: string }>(
          `select (
             (select count(*) from public.payments where id = any($1::uuid[])) +
             (select count(*) from public.subscriptions where org_id = $2::uuid) +
             (select count(*) from public.organizations where id = $2::uuid)
           )::text as count`,
          [paymentIds, orgId],
        );
        expect(remaining.rows[0]?.count).toBe("0");
      }
    } finally {
      await owner?.end().catch(() => {});
      await closePool();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("allows one activation and rejects the competing reuse of one provider transaction", async () => {
    if (!owner) throw new Error("Payment concurrency fixture connection was not initialized");
    const fixtureClient = owner;
    const paidAt = new Date("2026-10-16T00:00:00.000Z");
    const outcomes = await Promise.allSettled(
      paymentIds.map((paymentId) =>
        convergeVerifiedPayment({
          paymentId,
          providerTransactionId: "shared-paystack-transaction-test",
          paidAt,
          paymentMethod: "card",
        }),
      ),
    );

    const diagnostics = outcomes.map((outcome) => {
      if (outcome.status === "fulfilled") return { status: "fulfilled" };
      const reason = outcome.reason as {
        name?: string;
        code?: string;
        query?: string;
        cause?: { code?: string };
      };
      return {
        status: "rejected",
        name: reason?.name ?? "unknown",
        code: reason?.code ?? reason?.cause?.code ?? "unknown",
        query: typeof reason?.query === "string"
          ? reason.query.replace(/\s+/g, " ").trim()
          : "unknown",
      };
    });
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
      `sanitized outcomes: ${JSON.stringify(diagnostics)}`,
    ).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "PaymentVerificationError",
        message: "Payment transaction was already used",
      }),
    });

    const rows = await fixtureClient.query<{ status: string; provider_transaction_id: string | null }>(
      `select status, provider_transaction_id
         from public.payments
        where id = any($1::uuid[])
        order by id`,
      [paymentIds],
    );
    expect(rows.rows.filter((row) => row.status === "verified")).toHaveLength(1);
    expect(rows.rows.filter((row) => row.status === "pending")).toHaveLength(1);
    expect(rows.rows.filter((row) => row.provider_transaction_id === "shared-paystack-transaction-test")).toHaveLength(1);

    const subscription = await fixtureClient.query<{
      count: string;
      plan_key: string;
      billing_state: string;
      requested_plan_key: string | null;
    }>(
      `select count(*) over ()::text as count, plan_key, billing_state, requested_plan_key
         from public.subscriptions
        where org_id = $1::uuid`,
      [orgId],
    );
    expect(subscription.rows).toHaveLength(1);
    expect(subscription.rows[0]).toEqual({
      count: "1",
      plan_key: "pro",
      billing_state: "active",
      requested_plan_key: null,
    });
  });
});
