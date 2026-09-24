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

export async function withUserSession<T>(
  clerkUserId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select app.begin_user_session(${clerkUserId})`);
    return fn(tx);
  });
}

export async function withTenant<T>(
  clerkUserId: string,
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select app.begin_user_session(${clerkUserId})`);
    // Raises 42501 when the identity is not an active member of this workspace.
    await tx.execute(sql`select app.set_tenant_context(${orgId}::uuid)`);
    await tx.execute(sql`set local role workflow_app`);
    return fn(tx);
  });
}

/** Run a privileged function (definer path) without dropping to the app role. */
export async function withUserContext<T>(
  clerkUserId: string,
  orgId: string | null,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select app.begin_user_session(${clerkUserId})`);
    if (orgId) {
      await tx.execute(sql`select app.set_tenant_context(${orgId}::uuid)`);
    }
    return fn(tx);
  });
}

export async function createOrganizationForCurrentUser(
  clerkUserId: string,
  name: string,
  slugBase: string,
): Promise<string> {
  return withUserContext(clerkUserId, null, async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select app.create_organization(${name}, ${slugBase}) as id`,
    );
    return rows.rows[0].id;
  });
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
