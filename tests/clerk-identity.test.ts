/**
 * Clerk identity path against a REAL PostgreSQL branch.
 *
 * Covers the database half of Clerk authentication: provisioning
 * (upsert_local_user), session bootstrap (begin_user_session),
 * platform-admin resolution (is_platform_admin_user) and the legacy
 * token-verified entry point (begin_legacy_session). These are the exact
 * functions src/lib/auth.ts and src/lib/tenant.ts call after Clerk itself
 * has verified the subject — so they are tested here without mocking the
 * security boundary. The Clerk-hosted half (sign up/in/out UI) requires
 * real test keys and is exercised manually per docs/CLERK.md.
 *
 * Expected environment: DATABASE_URL_UNPOOLED pointing at a NON-production
 * branch (the development branch). All fixtures use unique subjects and are
 * removed afterwards.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./setup";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const suite = hasDatabase ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);

const clerk = {
  fresh: `clerk_test_fresh_${suffix}`,
  legacy: `clerk_test_legacy_${suffix}`,
  rival: `clerk_test_rival_${suffix}`,
  admin: `clerk_test_admin_${suffix}`,
  stranger: `clerk_test_stranger_${suffix}`,
};

let owner: pg.Client;
const createdUserIds: string[] = [];

async function q<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await owner.query(text, params);
  return res.rows as T[];
}

async function expectPgError(promise: Promise<unknown>, code = "42501"): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  if (!hasDatabase) return;
  owner = new pg.Client({ connectionString });
  await owner.connect();
});

afterAll(async () => {
  if (!hasDatabase) return;
  // Remove every fixture row this suite created, in FK-safe order.
  await owner
    .query(`delete from public.platform_admins where clerk_user_id like 'clerk_test_%_${suffix}'`)
    .catch(() => {});
  await owner
    .query(`delete from public.sessions where user_id = any(select id from public.users where clerk_user_id like 'clerk_test_%_${suffix}' or email like '%_${suffix}@test.local')`)
    .catch(() => {});
  await owner
    .query(`delete from public.users where clerk_user_id like 'clerk_test_%_${suffix}' or email like '%_${suffix}@test.local'`)
    .catch(() => {});
  await owner.end().catch(() => {});
  void createdUserIds;
});

suite("clerk identity path (real PostgreSQL)", () => {
  it("provisions a fresh profile and returns the same id on re-run", async () => {
    const email = `fresh_${suffix}@test.local`;
    const first = await q<{ id: string }>(`select app.upsert_local_user($1, $2, $3) as id`, [
      clerk.fresh,
      email,
      "Fresh User",
    ]);
    expect(first[0].id).toMatch(/^[0-9a-f-]{36}$/);

    const second = await q<{ id: string }>(`select app.upsert_local_user($1, $2, $3) as id`, [
      clerk.fresh,
      email,
      "Renamed User",
    ]);
    expect(second[0].id).toBe(first[0].id);
  });

  it("links a pre-Clerk legacy row by email instead of duplicating it", async () => {
    const email = `legacy_${suffix}@test.local`;
    await q(`insert into public.users (email, name) values ($1, 'Legacy Row')`, [email]);

    const linked = await q<{ id: string }>(`select app.upsert_local_user($1, $2, $3) as id`, [
      clerk.legacy,
      email,
      "Legacy Row",
    ]);
    const check = await q<{ id: string; clerk_user_id: string; email_verified: boolean }>(
      `select id, clerk_user_id, email_verified from public.users where email = $1`,
      [email],
    );
    expect(check).toHaveLength(1);
    expect(check[0].id).toBe(linked[0].id);
    expect(check[0].clerk_user_id).toBe(clerk.legacy);
    expect(check[0].email_verified).toBe(true);
  });

  it("refuses to merge a second Clerk subject into a claimed email", async () => {
    const email = `fresh_${suffix}@test.local`;
    await expectPgError(
      q(`select app.upsert_local_user($1, $2, $3)`, [clerk.rival, email, "Rival"]),
    );
  });

  it("starts a session for a provisioned subject and exposes its id", async () => {
    // Identity context is transaction-local by design (set_config(..., true)),
    // exactly as withTenant() uses it — so both calls share one transaction.
    await owner.query("begin");
    try {
      const began = await q<{ id: string }>(`select app.begin_user_session($1) as id`, [
        clerk.fresh,
      ]);
      const current = await q<{ id: string }>(`select app.current_user_id() as id`);
      expect(began[0].id).toBeTruthy();
      expect(current[0].id).toBe(began[0].id);
    } finally {
      await owner.query("rollback");
    }
  });

  it("refuses a session for an unprovisioned subject", async () => {
    await expectPgError(q(`select app.begin_user_session($1)`, [clerk.stranger]));
    await expectPgError(q(`select app.begin_user_session($1)`, [""]));
  });

  it("resolves platform-admin only from the allowlist table", async () => {
    const before = await q<{ ok: boolean }>(`select app.is_platform_admin_user($1) as ok`, [
      clerk.admin,
    ]);
    expect(before[0].ok).toBe(false);

    const adminId = await q<{ id: string }>(`select app.upsert_local_user($1, $2, $3) as id`, [
      clerk.admin,
      `admin_${suffix}@test.local`,
      "Admin User",
    ]);
    await q(
      `insert into public.platform_admins (clerk_user_id, user_id, email, active) values ($1, $2::uuid, $3, true)`,
      [clerk.admin, adminId[0].id, `admin_${suffix}@test.local`],
    );
    const during = await q<{ ok: boolean }>(`select app.is_platform_admin_user($1) as ok`, [
      clerk.admin,
    ]);
    expect(during[0].ok).toBe(true);

    await q(`update public.platform_admins set active = false where clerk_user_id = $1`, [
      clerk.admin,
    ]);
    const revoked = await q<{ ok: boolean }>(`select app.is_platform_admin_user($1) as ok`, [
      clerk.admin,
    ]);
    expect(revoked[0].ok).toBe(false);
  });

  it("verifies legacy session secrets in the database, never trusting the caller", async () => {
    await expectPgError(q(`select app.begin_legacy_session($1)`, ["not-a-real-token"]));
    await expectPgError(q(`select app.begin_legacy_session($1)`, [""]));
  });
});
