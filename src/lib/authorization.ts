import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, withUserContext, type TenantTx } from "@/lib/tenant";

/**
 * Application authorization.
 *
 * Permissions are resolved from the database for the *current* tenant context
 * (organization_members -> role_permissions -> permissions). A browser can only
 * influence which workspace is requested; it can never assert a permission, a
 * role or a platform-operator status.
 */

export type AuthorizationFailure = "unauthenticated" | "forbidden";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly reason: AuthorizationFailure,
    readonly permission?: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getPermissions(clerkUserId: string, orgId: string): Promise<string[]> {
  return withUserContext(clerkUserId, orgId, async (tx) => {
    const result = await tx.execute<{ key: string }>(
      sql`select * from app.current_permissions() as key`,
    );
    return result.rows.map((r) => r.key);
  });
}

export async function hasPermission(
  clerkUserId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  return withUserContext(clerkUserId, orgId, async (tx) => {
    const result = await tx.execute<{ ok: boolean }>(
      sql`select app.has_permission(${permission}) as ok`,
    );
    return Boolean(result.rows[0]?.ok);
  });
}

/**
 * Enforce a permission, optionally recording a denial in the audit log.
 *
 * auditOnDenial should be true only for genuine user-initiated blocked actions
 * (navigation, a protected button). Capability discovery and background polling
 * must stay silent, otherwise the audit log becomes noise nobody reads.
 */
export async function requirePermission(
  clerkUserId: string,
  orgId: string,
  permission: string,
  options?: { auditOnDenial?: boolean; context?: string },
): Promise<void> {
  const allowed = await hasPermission(clerkUserId, orgId, permission);
  if (allowed) return;

  if (options?.auditOnDenial) {
    try {
      await withUserContext(clerkUserId, orgId, async (tx) => {
        await tx.execute(sql`
          insert into public.audit_logs (org_id, user_id, action, entity_type, metadata)
          values (
            ${orgId}::uuid,
            app.current_user_id(),
            'permission_denied',
            'security',
            ${JSON.stringify({ permission, context: options.context ?? "requirePermission" })}::jsonb
          )
        `);
      });
    } catch {
      // A failed audit write must never turn a deny into an allow.
    }
  }

  throw new AuthorizationError(
    `Missing permission: ${permission}`,
    "forbidden",
    permission,
  );
}

/**
 * Platform operators are verified against platform_admins, which is deny-all
 * for the application role. Bootstrap is deliberately separate from customer
 * workspace provisioning: a subject may only claim it when it matches the
 * server-configured allowlist.
 */
export async function isPlatformAdmin(clerkUserId: string): Promise<boolean> {
  const result = await db_isPlatformAdmin(clerkUserId);
  return result;
}

async function db_isPlatformAdmin(clerkUserId: string): Promise<boolean> {
  const rows = await withUserContext(clerkUserId, null, async (tx) => {
    const res = await tx.execute<{ ok: boolean }>(
      sql`select app.is_platform_admin_user(${clerkUserId}) as ok`,
    );
    return res.rows;
  });
  return Boolean(rows[0]?.ok);
}

export async function requirePlatformAdmin(clerkUserId: string): Promise<void> {
  if (!(await isPlatformAdmin(clerkUserId))) {
    throw new AuthorizationError("Platform administration is restricted.", "forbidden");
  }
}

/**
 * Claim platform administration. Only succeeds for the allowlisted subject;
 * the database function performs that comparison, so this cannot be spoofed by
 * a caller that simply passes a different id.
 */
export async function claimPlatformAdmin(
  clerkUserId: string,
  email: string,
): Promise<boolean> {
  const allowlisted = process.env.PLATFORM_ADMIN_CLERK_USER_ID;
  if (!allowlisted || allowlisted.trim() === "") return false;

  const rows = await withUserContext(clerkUserId, null, async (tx) => {
    const res = await tx.execute<{ ok: boolean }>(
      sql`select app.claim_platform_admin(${clerkUserId}, ${allowlisted}, ${email}) as ok`,
    );
    return res.rows;
  });
  return Boolean(rows[0]?.ok);
}

/**
 * The sanctioned way to touch tenant data: permission-checked, tenant-scoped,
 * executed as the restricted runtime role.
 */
export async function withAuthorizedTenant<T>(
  clerkUserId: string,
  orgId: string,
  permission: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!(await hasPermission(clerkUserId, orgId, permission))) {
    throw new AuthorizationError(`Missing permission: ${permission}`, "forbidden", permission);
  }
  return withTenant(clerkUserId, orgId, fn);
}

/** Read-only tenant access when a specific permission is not required. */
export async function withTenantRead<T>(
  clerkUserId: string,
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return withTenant(clerkUserId, orgId, fn);
}
