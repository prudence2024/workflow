/**
 * Tenant isolation against a REAL PostgreSQL branch.
 *
 * These tests exercise PostgreSQL row level security itself. They are not
 * mocks: they open the restricted `workflow_app` / `workflow_worker` roles,
 * set organisation context through the same functions the application uses,
 * and assert that the engine denies what it must deny.
 *
 * Expected environment: DATABASE_URL_UNPOOLED pointing at a NON-production
 * branch (the development branch). Fixtures are created and removed by the
 * suite itself; nothing outside the created organisations is touched.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./setup";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const suite = hasDatabase ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);

const clerk = {
  ownerA: `clerk_test_ownerA_${suffix}`,
  ownerB: `clerk_test_ownerB_${suffix}`,
  dual: `clerk_test_dual_${suffix}`,
  outsider: `clerk_test_outsider_${suffix}`,
};

let ownerClient: pg.Client;
let orgA = "";
let orgB = "";
let contactA = "";
let contactB = "";
let dualUserId = "";
let outsiderUserId = "";

async function withOwner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Run `fn` inside a transaction acting as the restricted application role. */
async function asTenant<T>(
  clerkUserId: string,
  orgId: string | null,
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  return withOwner(async (client) => {
    await client.query("begin");
    try {
      await client.query("select app.begin_user_session($1)", [clerkUserId]);
      if (orgId) await client.query("select app.set_tenant_context($1)", [orgId]);
      await client.query("set local role workflow_app");
      return await fn(client);
    } finally {
      await client.query("rollback").catch(() => {});
    }
  });
}

/** Run privileged functions and COMMIT the result (for state-changing tests). */
async function asTenantCommitted<T>(
  clerkUserId: string,
  orgId: string | null,
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  return withOwner(async (client) => {
    await client.query("begin");
    await client.query("select app.begin_user_session($1)", [clerkUserId]);
    if (orgId) await client.query("select app.set_tenant_context($1)", [orgId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  });
}

/** Same as asTenant but without switching role, to call privileged functions. */
async function asTenantWithContext<T>(
  clerkUserId: string,
  orgId: string | null,
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  return withOwner(async (client) => {
    await client.query("begin");
    try {
      await client.query("select app.begin_user_session($1)", [clerkUserId]);
      if (orgId) await client.query("select app.set_tenant_context($1)", [orgId]);
      return await fn(client);
    } finally {
      await client.query("rollback").catch(() => {});
    }
  });
}

async function expectPgError(promise: Promise<unknown>, code = "42501") {
  let caught: (Error & { code?: string }) | null = null;
  try {
    await promise;
  } catch (err) {
    caught = err as Error & { code?: string };
  }
  expect(caught, "expected a PostgreSQL error but the statement succeeded").not.toBeNull();
  expect(caught?.code, `expected SQLSTATE ${code}, got ${caught?.code}`).toBe(code);
}

suite("tenant isolation (real PostgreSQL)", () => {
  beforeAll(async () => {
    ownerClient = new pg.Client({ connectionString });
    await ownerClient.connect();

    // Provision identities and workspaces through the privileged bootstrap
    // functions the application itself uses.
    for (const [key, email] of [
      ["ownerA", `ownerA_${suffix}@test.local`],
      ["ownerB", `ownerB_${suffix}@test.local`],
      ["dual", `dual_${suffix}@test.local`],
      ["outsider", `outsider_${suffix}@test.local`],
    ] as const) {
      await ownerClient.query("select app.upsert_local_user($1, $2, $3)", [
        clerk[key],
        email,
        key,
      ]);
    }

    await ownerClient.query("begin");
    await ownerClient.query("select app.begin_user_session($1)", [clerk.ownerA]);
    orgA = (
      await ownerClient.query("select app.create_organization($1, $2) as id", [
        `Tenant A ${suffix}`,
        `tenant-a-${suffix}`,
      ])
    ).rows[0].id;
    await ownerClient.query("commit");

    await ownerClient.query("begin");
    await ownerClient.query("select app.begin_user_session($1)", [clerk.ownerB]);
    orgB = (
      await ownerClient.query("select app.create_organization($1, $2) as id", [
        `Tenant B ${suffix}`,
        `tenant-b-${suffix}`,
      ])
    ).rows[0].id;
    await ownerClient.query("commit");

    // A user who legitimately belongs to both workspaces.
    const dual = await ownerClient.query(
      "select id from public.users where clerk_user_id = $1",
      [clerk.dual],
    );
    dualUserId = dual.rows[0].id;
    const outsider = await ownerClient.query(
      "select id from public.users where clerk_user_id = $1",
      [clerk.outsider],
    );
    outsiderUserId = outsider.rows[0].id;

    // Each workspace is administered by its own owner: owner A must not be able
    // to write into workspace B (which the isolation guard would refuse).
    for (const [org, actor] of [
      [orgA, clerk.ownerA],
      [orgB, clerk.ownerB],
    ] as const) {
      await ownerClient.query("begin");
      await ownerClient.query("select app.begin_user_session($1)", [actor]);
      await ownerClient.query("select app.set_tenant_context($1)", [org]);
      const memberRole = await ownerClient.query(
        "select id from public.roles where key = 'member'",
      );
      await ownerClient.query(
        `insert into public.organization_members (org_id, user_id, role, role_id, status)
         values ($1, $2, 'member', $3, 'active')`,
        [org, dualUserId, memberRole.rows[0].id],
      );
      await ownerClient.query("commit");
    }

    // One contact per tenant, inserted as the tenant itself.
    // Fixtures are written through the restricted role (so the insert path is
    // exercised) and COMMITTED, otherwise the assertions would test nothing.
    contactA = await asTenantCommitted(clerk.ownerA, orgA, async (c) => {
      const res = await c.query(
        "insert into public.contacts (org_id, first_name, email) values ($1, $2, $3) returning id",
        [orgA, "Alice A", `alice_${suffix}@a.local`],
      );
      return res.rows[0].id as string;
    });

    contactB = await asTenantCommitted(clerk.ownerB, orgB, async (c) => {
      const res = await c.query(
        "insert into public.contacts (org_id, first_name, email) values ($1, $2, $3) returning id",
        [orgB, "Bob B", `bob_${suffix}@b.local`],
      );
      return res.rows[0].id as string;
    });
  }, 90_000);

  afterAll(async () => {
    if (!ownerClient) return;
    try {
      // Defensive: a failure inside a setup transaction can leave the shared
      // client mid-transaction, which would mask the real error.
      await ownerClient.query("rollback").catch(() => {});
      const clerks = Object.values(clerk);
      // audit_logs.user_id has no ON DELETE action, so audit rows must be
      // removed explicitly before the fixture profiles (a deliberate retention
      // decision that belongs to the product, not to this test).
      await ownerClient.query(
        "delete from public.audit_logs where user_id in (select id from public.users where clerk_user_id = any($1::text[]))",
        [clerks],
      );
      await ownerClient.query("delete from public.platform_admins where clerk_user_id = any($1::text[])", [
        clerks,
      ]);
      await ownerClient.query("delete from public.organizations where id = any($1::uuid[])", [
        [orgA, orgB].filter(Boolean),
      ]);
      await ownerClient.query("delete from public.users where clerk_user_id = any($1::text[])", [
        clerks,
      ]);
    } finally {
      await ownerClient.end().catch(() => {});
    }
  });

  it("provisions each organisation strictly for its own creator", async () => {
    const res = await withOwner((c) =>
      c.query("select org_id, user_id from public.organization_members where org_id = $1", [
        orgA,
      ]),
    );
    expect(res.rowCount).toBe(2); // owner A + the dual-member fixture
  });

  it("shows a tenant only its own records", async () => {
    const rows = await asTenant(clerk.ownerA, orgA, async (c) =>
      (await c.query("select id, org_id from public.contacts")).rows,
    );
    expect(rows.map((r) => r.id)).toContain(contactA);
    expect(rows.map((r) => r.id)).not.toContain(contactB);
    expect(new Set(rows.map((r) => r.org_id))).toEqual(new Set([orgA]));
  });

  it("returns zero rows for another tenant's data even with a direct filter", async () => {
    const res = await asTenant(clerk.ownerA, orgA, (c) =>
      c.query("select count(*)::int as n from public.contacts where org_id = $1", [orgB]),
    );
    expect(res.rows[0].n).toBe(0);
  });

  it("rejects a forged organisation context", async () => {
    await expectPgError(
      asTenant(clerk.ownerA, orgB, async () => undefined),
    );
  });

  it("rejects an organisation context for a user who is not a member", async () => {
    await expectPgError(
      asTenantWithContext(clerk.outsider, orgA, async () => undefined),
    );
  });

  it("rejects writing a row into another tenant", async () => {
    await expectPgError(
      asTenant(clerk.ownerA, orgA, (c) =>
        c.query(
          "insert into public.contacts (org_id, first_name) values ($1, 'smuggled')",
          [orgB],
        ),
      ),
    );
  });

  it("rejects cross-tenant updates that would move a row between tenants", async () => {
    await expectPgError(
      asTenant(clerk.ownerA, orgA, (c) =>
        c.query("update public.contacts set org_id = $1 where id = $2", [orgB, contactA]),
      ),
    );
  });

  it("lets a dual member read only the tenant they switched into", async () => {
    const inA = await asTenant(clerk.dual, orgA, (c) =>
      c.query("select id from public.contacts"),
    );
    expect(inA.rows.map((r) => r.id)).not.toContain(contactB);

    const inB = await asTenant(clerk.dual, orgB, (c) =>
      c.query("select id from public.contacts"),
    );
    expect(inB.rows.map((r) => r.id)).not.toContain(contactA);
    expect(inB.rows.map((r) => r.id)).toContain(contactB);
  });

  it("lists exactly the active workspaces for the switcher", async () => {
    const rows = await asTenantWithContext(clerk.dual, null, async (c) =>
      (await c.query("select org_id from app.user_organizations()")).rows.map((r) => r.org_id),
    );
    expect(new Set(rows)).toEqual(new Set([orgA, orgB]));
  });

  it("loses access immediately when membership is revoked (stale session)", async () => {
    await ownerClient.query(
      "update public.organization_members set status = 'revoked' where org_id = $1 and user_id = $2",
      [orgA, dualUserId],
    );
    try {
      await expectPgError(asTenant(clerk.dual, orgA, async () => undefined));
    } finally {
      await ownerClient.query(
        "update public.organization_members set status = 'active' where org_id = $1 and user_id = $2",
        [orgA, dualUserId],
      );
    }
  });

  it("resolves permissions from the database, not from the request", async () => {
    const ownerPerms = await asTenantWithContext(clerk.ownerA, orgA, async (c) =>
      (await c.query("select app.current_permissions() as key")).rows.map((r) => r.key),
    );
    // 0007 added messages:send for owner/admin/manager (11 -> 12 for owners).
    expect(ownerPerms.length).toBe(12);
    expect(new Set(ownerPerms).has("messages:send")).toBe(true);

    const dualPerms = await asTenantWithContext(clerk.dual, orgA, async (c) =>
      (await c.query("select app.current_permissions() as key")).rows.map((r) => r.key),
    );
    expect(new Set(dualPerms)).toEqual(new Set(["contacts:write", "imports:write"]));
  });

  it("cannot be given permissions it does not hold (viewer stays read-only)", async () => {
    const res = await asTenantWithContext(clerk.dual, orgA, (c) =>
      c.query("select app.has_permission('campaigns:run') as allowed"),
    );
    expect(res.rows[0].allowed).toBe(false);
  });

  it("denies demoting the last owner of a workspace", async () => {
    await expectPgError(
      asTenantWithContext(clerk.ownerA, orgA, async (c) => {
        const me = await c.query("select id from public.users where clerk_user_id = $1", [
          clerk.ownerA,
        ]);
        return c.query("select app.set_member_role($1, $2, 'member')", [orgA, me.rows[0].id]);
      }),
    );
  });

  it("refuses to invite someone directly as owner", async () => {
    await expectPgError(
      asTenantWithContext(clerk.ownerA, orgA, (c) =>
        c.query("select app.create_invitation($1, $2, 'owner')", [
          orgA,
          `invitee_${suffix}@test.local`,
        ]),
      ),
    );
  });

  it("scopes an invitation token to the invited identity", async () => {
    const token = await asTenantWithContext(clerk.ownerA, orgA, async (c) => {
      const res = await c.query("select app.create_invitation($1, $2, 'member') as token", [
        orgA,
        `invitee_${suffix}@test.local`,
      ]);
      return res.rows[0].token as string;
    });
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    await expectPgError(
      asTenantWithContext(clerk.outsider, null, (c) =>
        c.query("select app.accept_invitation($1)", [token]),
      ),
    );
  });

  it("blocks privilege self-escalation on the profile row", async () => {
    // Column-level grant: the app role may not write security-sensitive columns.
    await expectPgError(
      asTenant(clerk.dual, orgA, (c) =>
        c.query("update public.users set is_platform_admin = true where id = $1", [dualUserId]),
      ),
    );
  });

  it("keeps platform administration unreachable from the application role", async () => {
    await expectPgError(
      asTenant(clerk.dual, orgA, (c) => c.query("select * from public.platform_admins")),
    );
    await expectPgError(
      asTenant(clerk.dual, orgA, (c) =>
        c.query(
          "insert into public.platform_admins (clerk_user_id, email) values ($1, 'x@test.local')",
          [clerk.dual],
        ),
      ),
    );
  });

  it("keeps legacy credential and webhook tables unreadable by the app role", async () => {
    await expectPgError(asTenant(clerk.dual, orgA, (c) => c.query("select * from public.sessions")));
    await expectPgError(
      asTenant(clerk.dual, orgA, (c) => c.query("select * from public.webhook_events")),
    );
  });

  it("only mints platform administration for the allowlisted subject", async () => {
    await expectPgError(
      asTenantWithContext(clerk.dual, null, (c) =>
        c.query("select app.claim_platform_admin($1, $2, 'x@test.local')", [
          clerk.dual,
          clerk.ownerA,
        ]),
      ),
    );

    // Committed on purpose: a claim that only exists inside a rolled-back
    // transaction would prove nothing.
    const granted = await asTenantCommitted(clerk.dual, null, (c) =>
      c.query("select app.claim_platform_admin($1, $2, 'x@test.local') as ok", [
        clerk.dual,
        clerk.dual,
      ]),
    );
    expect(granted.rows[0].ok).toBe(true);

    const isAdmin = await withOwner((c) =>
      c.query("select app.is_platform_admin_user($1) as ok", [clerk.dual]),
    );
    expect(isAdmin.rows[0].ok).toBe(true);

    await ownerClient.query("delete from public.platform_admins where clerk_user_id = $1", [
      clerk.dual,
    ]);
  });

  it("gives the worker role the queue without the customer tables", async () => {
    const queue = await withOwner(async (c) => {
      await c.query("begin");
      await c.query("set local role workflow_worker");
      const res = await c.query("select count(*)::int as n from public.outbox_events");
      await c.query("rollback");
      return res.rows[0].n as number;
    });
    expect(queue).toBeGreaterThanOrEqual(0);

    await expectPgError(
      withOwner(async (c) => {
        await c.query("begin");
        await c.query("set local role workflow_worker");
        try {
          return await c.query("select * from public.organizations");
        } finally {
          await c.query("rollback").catch(() => {});
        }
      }),
    );
  });
});
