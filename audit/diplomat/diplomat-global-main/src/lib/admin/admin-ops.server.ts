/**
 * Server-only admin operations.
 *
 * This file MUST have a .server.ts suffix so TanStack Start's import-protection
 * plugin blocks it from leaking into client bundles.
 *
 * It is only imported via dynamic import() inside createServerFn handlers
 * in server-fns.ts — which is a client-importable file.
 */
import "@tanstack/react-start/server-only";
import { auth } from "@clerk/tanstack-react-start/server";
import { getRequestIP, getRequestHeaders } from "@tanstack/react-start/server";
import { createDatabaseClient, getDatabaseConfig } from "../database.server";

// ── Permission cache (performance optimization only, NOT spam suppression) ──
const _permCache = new Map<string, { allowed: boolean; expires: number }>();
const PERM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Audit deduplication: track last-denied-at per user+permission ──
// Prevents repeated audit events for the same permission within a cooldown,
// but audit decisions are driven by caller intent, not by cache expiry.
const _auditCooldown = new Map<string, number>(); // key → last-audit-timestamp
const AUDIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min cooldown for audit dedup

// ── Internal: resolve current admin's role_id ──
// Per-request memoization: requireAdmin() and requirePermission() both need
// the role row; without this, every serverFn pays 4 sequential DB round-trips
// (2 in requireAdmin + 2 here) before its actual query. The cache lives only
// for the current request's microtask chain — keyed by userId so parallel
// serverFn calls in one request share one resolution.
let _roleCache: {
  userId: string;
  value: { role_id: string; role_key: string } | null;
  expires: number;
} | null = null;
const ROLE_CACHE_TTL_MS = 30_000;

async function _resolveAdminRole(): Promise<{ role_id: string; role_key: string } | null> {
  try {
    const session = await auth();
    if (!session?.userId) return null;
    if (_roleCache && _roleCache.userId === session.userId && _roleCache.expires > Date.now()) {
      return _roleCache.value;
    }
    const db = createDatabaseClient();
    const { data: user } = await db
      .from("admin_users")
      .select("role_id")
      .eq("clerk_user_id", session.userId)
      .eq("active", true)
      .maybeSingle();
    if (!user?.role_id) {
      _roleCache = { userId: session.userId, value: null, expires: Date.now() + ROLE_CACHE_TTL_MS };
      return null;
    }
    const { data: roleRow } = await db.from("roles").select("key").eq("id", user.role_id).single();
    if (!roleRow) {
      _roleCache = { userId: session.userId, value: null, expires: Date.now() + ROLE_CACHE_TTL_MS };
      return null;
    }
    const value = { role_id: user.role_id, role_key: roleRow.key };
    _roleCache = { userId: session.userId, value, expires: Date.now() + ROLE_CACHE_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

// ── Internal: pure permission check (no side effects) ──
async function _checkPermission(
  roleId: string,
  roleKey: string,
  permissionKey: string,
): Promise<boolean> {
  // Owner has all permissions
  if (roleKey === "owner") return true;

  // Check cache
  const cacheKey = `${roleId}:${permissionKey}`;
  const cached = _permCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.allowed;

  const db = createDatabaseClient();

  // Lookup permission id by key
  const { data: perm } = await db
    .from("permissions")
    .select("id")
    .eq("key", permissionKey)
    .single();
  if (!perm) {
    _permCache.set(cacheKey, { allowed: false, expires: Date.now() + PERM_CACHE_TTL });
    return false;
  }

  // Check if role has this permission
  // IMPORTANT: role_permissions table does NOT have an 'id' column — select 'role_id' instead
  const { data: hasPerm } = await db
    .from("role_permissions")
    .select("role_id")
    .eq("role_id", roleId)
    .eq("permission_id", perm.id)
    .limit(1);

  const allowed = !!(hasPerm && hasPerm.length > 0);
  _permCache.set(cacheKey, { allowed, expires: Date.now() + PERM_CACHE_TTL });
  return allowed;
}

/**
 * PURE permission check — NEVER creates audit events.
 *
 * Use for: sidebar construction, button visibility, dashboard capability checks,
 * background polling, notification polling, feature availability, menu rendering,
 * loaders deciding which widgets to request.
 *
 * Returns true/false with zero side effects.
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
  const roleInfo = await _resolveAdminRole();
  if (!roleInfo) return false;
  return _checkPermission(roleInfo.role_id, roleInfo.role_key, permissionKey);
}

/**
 * Require admin authentication (no permission check, no audit).
 * Returns null on success or an error string.
 */
export async function requireAdmin(): Promise<string | null> {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
    return "Clerk is not configured.";
  try {
    const session = await auth();
    if (!session.isAuthenticated || !session.userId) return "Not authenticated.";
    if (!getDatabaseConfig()) return "Database not configured.";
    const db = createDatabaseClient();
    const { data } = await db
      .from("admin_users")
      .select("role_id, active")
      .eq("clerk_user_id", session.userId)
      .maybeSingle<{ role_id: string | null; active: boolean }>();
    if (!data?.active) return "Not authorized.";
    if (!data.role_id) return "Not authorized.";
    const { data: roleRow } = await db.from("roles").select("key").eq("id", data.role_id).single();
    if (!roleRow) return "Not authorized.";
    return null;
  } catch {
    return "Session verification failed.";
  }
}

/**
 * Require permission for an actual enforcement point (route protection, mutation guard).
 *
 * Returns null on success or an error string on denial.
 *
 * @param permissionKey - The permission to check
 * @param opts.auditOnDenial - If true, log a admin_permission_denied event on first denial.
 *   Only use this when the denial represents a genuine user-initiated blocked action
 *   (e.g., navigating to a restricted route, clicking a protected button).
 *   Do NOT set true for background polling, sidebar queries, or capability discovery.
 * @param opts.context - Human-readable label for the audit event (e.g., "navigate:/dashboard/audit-logs")
 */
export async function requirePermission(
  permissionKey: string,
  opts?: { auditOnDenial?: boolean; context?: string },
): Promise<string | null> {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const session = await auth();
    if (!session.userId) return "Not authenticated.";

    // _resolveAdminRole is memoized per request (above) — this no longer
    // repeats requireAdmin's two DB queries.
    const roleInfo = await _resolveAdminRole();
    if (!roleInfo) return "Not authorized.";

    const allowed = await _checkPermission(roleInfo.role_id, roleInfo.role_key, permissionKey);
    if (allowed) return null;

    // Permission denied
    const denialMsg = `Missing permission: ${permissionKey}`;

    // Only audit if caller explicitly requested it (genuine user-initiated denial)
    if (opts?.auditOnDenial) {
      const auditKey = `${session.userId}:${permissionKey}`;
      const lastAudit = _auditCooldown.get(auditKey) || 0;
      if (Date.now() - lastAudit > AUDIT_COOLDOWN_MS) {
        _auditCooldown.set(auditKey, Date.now());
        try {
          const db = createDatabaseClient();
          let ip: string | null = null;
          let ua: string | null = null;
          try {
            const raw = getRequestIP({ xForwardedFor: true });
            if (raw && typeof raw === "string") {
              const firstIp = raw.trim().split(",")[0]?.trim();
              if (
                firstIp &&
                (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(firstIp) ||
                  /^[0-9a-fA-F:]+$/.test(firstIp))
              )
                ip = firstIp;
            }
            const headers = getRequestHeaders() as unknown as Record<
              string,
              string | undefined
            > | null;
            const rawUa = headers?.["user-agent"];
            if (typeof rawUa === "string" && rawUa.length > 0 && rawUa.length < 512) ua = rawUa;
          } catch {
            /* audit: best-effort context extraction */
          }

          await db.from("audit_logs").insert({
            clerk_user_id: session.userId,
            action: "admin_permission_denied",
            entity_type: "security",
            entity_id: null,
            metadata: {
              permission: permissionKey,
              result: "blocked",
              role: roleInfo.role_key,
              context: opts.context || "requirePermission",
            },
            ip_address: ip,
            user_agent: ua,
          });
        } catch (auditErr) {
          // Security logging failure must not change DENY decision
          console.error("[audit] Failed to log permission_denied:", auditErr);
        }
      }
    }

    return denialMsg;
  } catch {
    return "Permission check failed.";
  }
}

/**
 * Get the permission keys for the currently authenticated admin.
 * Used by the sidebar to filter navigation items.
 * Pure read — no audit events.
 */
/** Current admin's role key (null if not an active admin). UI-only convenience; server authorization still goes through requireOwner/requirePermission. */
export async function getCurrentAdminRoleKey(): Promise<string | null> {
  const roleInfo = await _resolveAdminRole();
  return roleInfo?.role_key ?? null;
}

export async function getCurrentAdminPermissions(): Promise<string[]> {
  try {
    const session = await auth();
    if (!session?.userId) return [];
    const db = createDatabaseClient();
    // Single query: admin_users → roles → role_permissions → permissions
    const { data: user } = await db
      .from("admin_users")
      .select("role_id, roles!inner(key)")
      .eq("clerk_user_id", session.userId)
      .eq("active", true)
      .maybeSingle<{ role_id: string; roles: { key: string } }>();
    if (!user?.role_id) return [];
    const roleKey = user.roles?.key;
    // Owner has all permissions
    if (roleKey === "owner") {
      const { data: allPerms } = await db.from("permissions").select("key");
      return (allPerms || []).map((p: any) => p.key);
    }
    // Single query with FK join for role_permissions → permissions
    const { data: rolePerms } = await db
      .from("role_permissions")
      .select("permissions(key)")
      .eq("role_id", user.role_id);
    return (rolePerms || []).map((rp: any) => rp.permissions?.key).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Require Owner role specifically.
 * Used for critical operations: staff management, role permission management,
 * audit deletion, and other Owner-only controls.
 * Non-owner admins with staff.manage permission are still blocked.
 */
export async function requireOwner(): Promise<string | null> {
  const authErr = await requireAdmin();
  if (authErr) return authErr;
  try {
    const session = await auth();
    if (!session.userId) return "Not authenticated.";
    const roleInfo = await _resolveAdminRole();
    if (!roleInfo || roleInfo.role_key !== "owner") {
      return "This action is restricted to the Owner.";
    }
    return null;
  } catch {
    return "Authorization check failed.";
  }
}

export { createDatabaseClient, getDatabaseConfig, auth };

/** Simple audit logging helper */
export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, any>,
) {
  try {
    let userId = "unknown";
    try {
      const session = await auth();
      if (session.userId) userId = session.userId;
    } catch {
      /* audit: best-effort context extraction */
    }
    let ip: string | null = null;
    try {
      const raw = getRequestIP({ xForwardedFor: true });
      if (raw && typeof raw === "string") {
        const firstIp = raw.split(",")[0]?.trim();
        if (
          firstIp &&
          (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(firstIp) || /^[0-9a-fA-F:]+$/.test(firstIp))
        ) {
          ip = firstIp;
        }
      }
    } catch {
      /* audit: best-effort context extraction */
    }
    let ua: string | null = null;
    try {
      const headers = getRequestHeaders() as unknown as Record<string, string | undefined> | null;
      const raw = headers?.["user-agent"];
      if (typeof raw === "string" && raw.length > 0 && raw.length < 512) ua = raw;
    } catch {
      /* audit: best-effort context extraction */
    }
    const db = createDatabaseClient();
    await db.from("audit_logs").insert({
      clerk_user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      metadata: metadata || {},
      ip_address: ip,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[audit] Failed to log:", err);
  }
}

/**
 * Extract a single valid IP from x-forwarded-for.
 * First value = original client IP. Returns NULL for malformed/missing data.
 */
export function extractClientIp(): string | null {
  try {
    const raw = getRequestIP({ xForwardedFor: true });
    if (!raw || typeof raw !== "string") return null;
    const firstIp = raw.trim().split(",")[0]?.trim();
    if (!firstIp) return null;
    const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (ipv4.test(firstIp) || ipv6.test(firstIp)) return firstIp;
    return null;
  } catch {
    return null;
  }
}

/** Safely extract user-agent from request headers. */
export function extractUserAgent(): string | null {
  try {
    const headers = getRequestHeaders() as unknown as Record<string, string | undefined> | null;
    const ua = headers?.["user-agent"];
    return typeof ua === "string" && ua.length > 0 && ua.length < 512 ? ua : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an authenticated Clerk user id to authoritative audit actor fields:
 * admin_users id + explicit role key + Clerk profile name.
 * Never derives a display name from an email address.
 * Best-effort: returns null fields when resolution is unavailable.
 */
export async function resolveAuditActor(
  db: ReturnType<typeof createDatabaseClient>,
  userId: string,
): Promise<{ adminId: string | null; displayName: string | null; role: string | null }> {
  try {
    const { data: admin } = await db
      .from("admin_users")
      .select("id, role_id")
      .eq("clerk_user_id", userId)
      .maybeSingle();
    let role: string | null = null;
    if (admin?.role_id) {
      const { data: roleRow } = await db
        .from("roles")
        .select("key")
        .eq("id", admin.role_id)
        .maybeSingle();
      role = roleRow?.key ?? null;
    }
    let displayName: string | null = "Name not provided";
    try {
      const { createClerkClient } = await import("@clerk/backend");
      const user = await createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
      }).users.getUser(userId);
      displayName =
        [user.firstName, user.lastName].filter(Boolean).join(" ") || "Name not provided";
    } catch {
      /* Clerk lookup is best-effort; keep "Name not provided" */
    }
    return { adminId: admin?.id ?? null, displayName, role };
  } catch {
    return { adminId: null, displayName: null, role: null };
  }
}

/**
 * Log a security audit event with full context (IP, user-agent, route).
 * Called from route beforeLoad handlers as the single logging point.
 */
export async function logSecurityAuditEvent(action: string, metadata?: Record<string, any>) {
  try {
    let userId = "unknown";
    try {
      const session = await auth();
      if (session?.userId) userId = session.userId;
    } catch {
      /* audit: best-effort context extraction */
    }
    const ip = extractClientIp();
    const ua = extractUserAgent();
    const db = createDatabaseClient();
    // Server-authoritative actor attribution (display name + role), so the
    // audit UI can show real identity instead of an email prefix.
    let actorMetadata: Record<string, unknown> = {};
    if (userId !== "unknown") {
      const actor = await resolveAuditActor(db, userId);
      actorMetadata = {
        display_name: actor.displayName ?? "Name not provided",
        ...(actor.role ? { role: actor.role } : {}),
        ...(actor.adminId ? { admin_id: actor.adminId } : {}),
      };
    }
    await db.from("audit_logs").insert({
      clerk_user_id: userId,
      action,
      entity_type: "security",
      entity_id: null,
      metadata: { ...(metadata || {}), ...actorMetadata },
      ip_address: ip,
      user_agent: ua,
    });
  } catch {
    /* audit: best-effort context extraction */
  }
}
