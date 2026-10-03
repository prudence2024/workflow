/**
 * Edge transport (Neon WebSocket driver) against a REAL PostgreSQL branch.
 *
 * Proves the Cloudflare Workers transport preserves the exact transaction
 * semantics the tenant gateway depends on: BEGIN -> verified identity ->
 * membership-checked tenant context -> SET LOCAL ROLE workflow_app ->
 * queries -> COMMIT, with forced RLS enforcing isolation.
 *
 * Runs ONLY when DATABASE_RUNTIME=edge is set (plus a database URL);
 * ordinary `npm test` runs are unaffected. Fixtures are namespaced per run
 * and removed afterwards; nothing outside them is touched.
 *
 * Usage: DATABASE_RUNTIME=edge npx vitest run tests/edge-driver.test.ts
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./setup";
import { databaseRuntime } from "@/db";
import { withTenant } from "@/lib/tenant";

const enabled = hasDatabase && process.env.DATABASE_RUNTIME === "edge";
const suite = enabled ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const clerkOwner = `clerk_test_edge_${suffix}`;

let ownerClient: pg.Client;
let orgId = "";
let contactId = "";
let seedContactId = "";

async function expectPgError(promise: Promise<unknown>, code = "42501"): Promise<void> {
  let caught: (Error & { code?: string }) | null = null;
  try {
    await promise;
  } catch (err) {
    caught = err as Error & { code?: string };
  }
  expect(caught, "expected a PostgreSQL error but the statement succeeded").not.toBeNull();
  expect(caught?.code, `expected SQLSTATE ${code}, got ${caught?.code}`).toBe(code);
}

suite("edge transport preserves tenant transaction semantics", () => {
  beforeAll(async () => {
    if (!enabled) return;
    ownerClient = new pg.Client({ connectionString });
    await ownerClient.connect();

    await ownerClient.query("select app.upsert_local_user($1, $2, $3)", [
      clerkOwner,
      `edge_${suffix}@test.local`,
      "Edge Owner",
    ]);
    await ownerClient.query("begin");
    await ownerClient.query("select app.begin_user_session($1)", [clerkOwner]);
    orgId = (
      await ownerClient.query("select app.create_organization($1, $2) as id", [
        `Edge Org ${suffix}`,
        `edge-org-${suffix}`,
      ])
    ).rows[0].id;
    await ownerClient.query("commit");

    await ownerClient.query("begin");
    await ownerClient.query("select app.begin_user_session($1)", [clerkOwner]);
    await ownerClient.query("select app.set_tenant_context($1)", [orgId]);
    await ownerClient.query("set local role workflow_app");
    contactId = (
      await ownerClient.query(
        "insert into public.contacts (org_id, first_name, email) values ($1, $2, $3) returning id",
        [orgId, "Edge", `edge_${suffix}@e.local`],
      )
    ).rows[0].id;
    await ownerClient.query("commit");

    const seed = await ownerClient.query(
      `select c.id from public.contacts c join public.organizations o on o.id = c.org_id
        where o.slug = 'lagos-tech-summit' limit 1`,
    );
    seedContactId = seed.rows[0]?.id ?? "";
  });

  afterAll(async () => {
    if (!enabled) return;
    const uid = (
      await ownerClient.query("select id from public.users where clerk_user_id = $1", [clerkOwner])
    ).rows[0]?.id;
    if (uid) {
      await ownerClient.query(`delete from public.audit_logs where user_id = $1::uuid`, [uid]).catch(() => {});
      await ownerClient.query(`delete from public.organization_members where user_id = $1::uuid`, [uid]).catch(() => {});
      await ownerClient.query(`delete from public.contacts where org_id = $1::uuid`, [orgId]).catch(() => {});
      await ownerClient.query(`delete from public.organizations where id = $1::uuid`, [orgId]).catch(() => {});
      await ownerClient.query(`delete from public.users where id = $1::uuid`, [uid]).catch(() => {});
    }
    await ownerClient.end().catch(() => {});
  });

  it("runs on the edge transport", () => {
    expect(databaseRuntime()).toBe("edge");
  });

  it("reads own rows with the restricted role inside withTenant", async () => {
    const rows = await withTenant({ kind: "clerk", clerkUserId: clerkOwner }, orgId, async (tx) => {
      const role = await tx.execute<{ role: string }>(sql`select current_user as role`);
      const org = await tx.execute<{ id: string }>(sql`select app.current_org_id() as id`);
      const contacts = await tx.execute<{ id: string }>(
        sql`select id from public.contacts where org_id = ${orgId}::uuid`,
      );
      return { role: role.rows[0].role, org: org.rows[0].id, contacts: contacts.rows.map((r) => r.id) };
    });
    expect(rows.role).toBe("workflow_app");
    expect(rows.org).toBe(orgId);
    expect(rows.contacts).toContain(contactId);
  });

  it("hides another tenant's rows over the edge transport", async () => {
    if (!seedContactId) return;
    const found = await withTenant({ kind: "clerk", clerkUserId: clerkOwner }, orgId, async (tx) => {
      const res = await tx.execute<{ id: string }>(
        sql`select id from public.contacts where id = ${seedContactId}::uuid`,
      );
      return res.rows;
    });
    expect(found).toHaveLength(0);
  });

  it("rejects a forged organisation context over the edge transport", async () => {
    await expectPgError(
      withTenant({ kind: "clerk", clerkUserId: clerkOwner }, "00000000-0000-4000-8000-000000000099", async () => undefined),
    );
  });

  it("rolls back a failed edge transaction without persisting", async () => {
    const before = await withTenant({ kind: "clerk", clerkUserId: clerkOwner }, orgId, async (tx) => {
      const res = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from public.contacts where org_id = ${orgId}::uuid`,
      );
      return res.rows[0].n;
    });
    await expect(
      withTenant({ kind: "clerk", clerkUserId: clerkOwner }, orgId, async (tx) => {
        await tx.execute(
          sql`insert into public.contacts (org_id, first_name) values (${orgId}::uuid, 'Rollback')`,
        );
        throw new Error("deliberate rollback");
      }),
    ).rejects.toThrow("deliberate rollback");
    const after = await withTenant({ kind: "clerk", clerkUserId: clerkOwner }, orgId, async (tx) => {
      const res = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from public.contacts where org_id = ${orgId}::uuid`,
      );
      return res.rows[0].n;
    });
    expect(after).toBe(before);
  });
});
