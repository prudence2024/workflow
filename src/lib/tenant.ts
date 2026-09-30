import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Transaction-scoped tenant access.
 *
 * Every tenant read/write runs inside a transaction that:
 *   1. resolves the local profile from a verified Clerk subject,
 *   2. sets the organisation context through the membership-verifying
 *      database function (a forged org id raises 42501),
 *   3. drops to the restricted `workflow_app` role, which has no BYPASSRLS,
 *      so PostgreSQL row level security actually applies.
 *
 * Because the context is transaction-local (`set_config(..., true)`), a pooled
 * connection can never leak one tenant's context into the next request.
 */
export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How a request has been identified.
 *
 * Both variants are only ever constructed from something the server verified: a
 * Clerk subject from a signed session, or a session token read from an httpOnly
 * cookie and re-verified inside the database.
 */
export type Identity =
  | { kind: "clerk"; clerkUserId: string }
  | { kind: "legacy"; sessionToken: string };

async function beginSession(tx: TenantTx, identity: Identity): Promise<void> {
  if (identity.kind === "clerk") {
    await tx.execute(sql`select app.begin_user_session(${identity.clerkUserId})`);
    return;
  }
  // Verified by the database, never asserted by the caller.
  await tx.execute(sql`select app.begin_legacy_session(${identity.sessionToken})`);
}

export async function withUserSession<T>(
  identity: Identity,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await beginSession(tx, identity);
    return fn(tx);
  });
}

/**
 * THE sanctioned way to read or write customer data.
 *
 * Order matters and is not interchangeable:
 *   1. establish a verified identity,
 *   2. prove active membership of the requested organisation (42501 otherwise),
 *   3. drop to `workflow_app`, which has NO bypassrls — so row level security
 *      stops being advisory and becomes the enforcement point.
 */
export async function withTenant<T>(
  identity: Identity,
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await beginSession(tx, identity);
    await tx.execute(sql`select app.set_tenant_context(${orgId}::uuid)`);
    await tx.execute(sql`set local role workflow_app`);
    return fn(tx);
  });
}

/** Privileged (SECURITY DEFINER) path — bootstrap and admin calls only. */
export async function withPrivilegedContext<T>(
  identity: Identity,
  orgId: string | null,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await beginSession(tx, identity);
    if (orgId) await tx.execute(sql`select app.set_tenant_context(${orgId}::uuid)`);
    return fn(tx);
  });
}

/**
 * Run a privileged (SECURITY DEFINER) function without dropping to the app role.
 * Kept for bootstrap and administration. Customer-facing reads must use
 * withTenant() instead.
 */
export async function withUserContext<T>(
  clerkUserId: string,
  orgId: string | null,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return withPrivilegedContext({ kind: "clerk", clerkUserId }, orgId, fn);
}

/**
 * Provision a workspace through the database function that atomically creates
 * the organisation, its owner membership, its subscription and the audit trail.
 * Slug collisions are resolved inside the function, so the caller never races.
 * Works for both a Clerk subject and a freshly-minted legacy session token.
 */
export async function createOrganizationForIdentity(
  identity: Identity,
  name: string,
  slugBase: string,
): Promise<string> {
  return withUserSession(identity, async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select app.create_organization(${name}, ${slugBase}) as id`,
    );
    return rows.rows[0].id;
  });
}

export async function createOrganizationForCurrentUser(
  clerkUserId: string,
  name: string,
  slugBase: string,
): Promise<string> {
  return createOrganizationForIdentity({ kind: "clerk", clerkUserId }, name, slugBase);
}

export async function listOrganizationsForCurrentUser(clerkUserId: string) {
  return withUserContext(clerkUserId, null, async (tx) => {
    const rows = await tx.execute<{
      org_id: string;
      org_name: string;
      org_slug: string;
      plan_key: string;
      role_key: string;
    }>(sql`select * from app.user_organizations()`);
    return rows.rows;
  });
}

export async function currentPermissions(clerkUserId: string, orgId: string): Promise<string[]> {
  return withUserContext(clerkUserId, orgId, async (tx) => {
    const rows = await tx.execute<{ key: string }>(sql`select * from app.current_permissions() as key`);
    return rows.rows.map((r) => r.key);
  });
}
