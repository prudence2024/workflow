import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { createDatabaseClient, getDatabaseConfig } from "./database.server";

export type AdminRole = "owner" | "admin" | "editor" | "support";

/**
 * Pure authorization check — NO audit logging.
 * Security event logging is handled by the calling route (dashboard.tsx boundary guard).
 * This avoids duplicate events from route-chain evaluation.
 *
 * Returns:
 * - "authorized" with userId and role
 * - "forbidden" with userId, role, and reason for the caller to log
 * - "unauthenticated", "unconfigured", "unavailable", "setup_required"
 */
export const getAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
    return { status: "unconfigured" as const };

  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch (error) {
    console.error("Clerk session verification failed", error);
    // Preserve the failure mode: a network interruption reaching Clerk is not
    // the same condition as a missing/invalid configuration.
    if (
      error instanceof Error &&
      /fetch failed|network|timed? ?out|socket|aborted|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(
        error.message,
      )
    ) {
      return { status: "network_unavailable" as const };
    }
    return { status: "unavailable" as const };
  }

  if (!session.isAuthenticated || !session.userId) return { status: "unauthenticated" as const };

  if (!getDatabaseConfig()) return { status: "unconfigured" as const };

  const database = createDatabaseClient();

  const { data, error } = await database
    .from("admin_users")
    .select("active, role_id, roles(key)")
    .eq("clerk_user_id", session.userId)
    .maybeSingle<{ active: boolean; role_id: string | null; roles: { key: string } | null }>();

  if (error) {
    const missingTable =
      error.code === "PGRST205" || /could not find the table/i.test(error.message ?? "");
    console.error("Admin authorization lookup failed", { code: error.code, missingTable });
    if (missingTable) return { status: "setup_required" as const };
    return { status: "unavailable" as const };
  }

  const resolvedRole = data?.roles?.key as AdminRole | undefined;

  // Authorized — any active user with a valid role can access the dashboard.
  // Fine-grained permissions are enforced by requirePermission in individual server functions.
  if (data?.active && resolvedRole) {
    // Backfill email from verified Clerk API if missing — non-blocking
    // Only runs when email is genuinely missing, not on every load
    try {
      const { data: fullRow } = await database
        .from("admin_users")
        .select("id, email")
        .eq("clerk_user_id", session.userId)
        .maybeSingle();
      if (fullRow && !fullRow.email) {
        const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
        if (clerkSecretKey) {
          // Fire-and-forget: don't await this on every load
          fetch(`https://api.clerk.com/v1/users/${session.userId}`, {
            headers: { Authorization: `Bearer ${clerkSecretKey}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then(async (clerkUser) => {
              if (!clerkUser) return;
              const primaryEmailEntry = clerkUser.email_addresses?.find(
                (e: any) => e.id === clerkUser.primary_email_address_id,
              );
              const primaryEmail = primaryEmailEntry?.email_address;
              const isVerified = primaryEmailEntry?.verification?.status === "verified";
              if (primaryEmail && isVerified) {
                const normalized = primaryEmail.trim().toLowerCase();
                await database
                  .from("admin_users")
                  .update({ email: normalized })
                  .eq("id", fullRow.id);
              }
            })
            .catch(() => {}); // Best-effort
        }
      }
    } catch {
      // Best-effort — email backfill failure must not block auth
    }

    return { status: "authorized" as const, userId: session.userId, role: resolvedRole };
  }

  // Forbidden — determine denial reason for the caller
  if (data && !data.active) {
    return {
      status: "forbidden" as const,
      userId: session.userId,
      reason: "inactive",
      role: resolvedRole,
    } as any;
  }
  // Only reject if user has a record but no valid role at all
  if (data && !resolvedRole) {
    return {
      status: "forbidden" as const,
      userId: session.userId,
      reason: "insufficient_role",
      role: resolvedRole,
    } as any;
  }

  // Not in admin_users by clerk_user_id — attempt auto-link for pending invitations
  if (!data) {
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
      if (clerkSecretKey) {
        const userRes = await fetch(`https://api.clerk.com/v1/users/${session.userId}`, {
          headers: { Authorization: `Bearer ${clerkSecretKey}` },
        });
        if (userRes.ok) {
          const clerkUser = await userRes.json();
          const primaryEmailEntry = clerkUser.email_addresses?.find(
            (e: any) => e.id === clerkUser.primary_email_address_id,
          );
          const primaryEmail = primaryEmailEntry?.email_address;
          const isVerified = primaryEmailEntry?.verification?.status === "verified";
          if (primaryEmail && isVerified) {
            const normalizedEmail = primaryEmail.toLowerCase().trim();
            const { data: pendingRow } = await database
              .from("admin_users")
              .select("id, role_id")
              .eq("email", normalizedEmail)
              .is("clerk_user_id", null)
              .maybeSingle();
            if (pendingRow) {
              await database
                .from("admin_users")
                .update({ clerk_user_id: session.userId, active: true })
                .eq("id", pendingRow.id);
              const { data: linked } = await database
                .from("admin_users")
                .select("active, roles(key)")
                .eq("clerk_user_id", session.userId)
                .maybeSingle<{ active: boolean; roles: { key: string } | null }>();
              const linkedRole = linked?.roles?.key as AdminRole | undefined;
              if (linked?.active && linkedRole && ["owner", "admin"].includes(linkedRole)) {
                return { status: "authorized" as const, userId: session.userId, role: linkedRole };
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[admin-auth] Auto-link failed:", err);
    }
    return {
      status: "forbidden" as const,
      userId: session.userId,
      reason: "not_in_admin_users",
    } as any;
  }

  return {
    status: "forbidden" as const,
    userId: session.userId,
    reason: "not_in_admin_users",
  } as any;
});

/**
 * First-run setup: promotes the INITIAL_ADMIN_CLERK_USER_ID to owner.
 */
export const claimOwnerAccess = createServerFn({ method: "POST" }).handler(async () => {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
    return { ok: false as const, message: "Clerk is not configured yet." };

  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch {
    return { ok: false as const, message: "Your session could not be verified. Sign in again." };
  }

  if (!session.isAuthenticated || !session.userId)
    return { ok: false as const, message: "You are not signed in." };

  function getInitialAdminId(): string | null {
    return process.env.INITIAL_ADMIN_CLERK_USER_ID?.trim() || null;
  }
  if (session.userId !== getInitialAdminId())
    return { ok: false as const, message: "You are not authorized to set up the admin account." };

  if (!getDatabaseConfig())
    return {
      ok: false as const,
      message: "The server-side database connection is not configured.",
    };

  const database = createDatabaseClient();

  const { count, error: countError } = await database
    .from("admin_users")
    .select("id", { count: "exact", head: true });

  if (countError) {
    const missingTable =
      countError.code === "PGRST205" || /could not find the table/i.test(countError.message ?? "");
    return {
      ok: false as const,
      message: missingTable
        ? "The admin_users table is missing. Run the Supabase migrations before continuing."
        : "The database could not be reached. Try again shortly.",
    };
  }

  if (count !== 0) {
    const { data: allRows } = await database
      .from("admin_users")
      .select("id, clerk_user_id, role_id")
      .limit(100);
    const allPending = allRows?.every((r: any) => r.clerk_user_id === null);
    if (allPending && allRows && allRows.length > 0) {
      // All rows are unlinked invitations — safe to clear for initial setup
      for (const row of allRows) {
        await database.from("admin_users").delete().eq("id", row.id);
      }
    } else {
      // Check if the current user owns a row that needs repair (role_id = NULL)
      const existingRow = allRows?.find((r: any) => r.clerk_user_id === session.userId);
      if (existingRow && !existingRow.role_id) {
        // Repair: set the correct role_id on the existing broken row
        const { data: ownerRole } = await database
          .from("roles")
          .select("id")
          .eq("key", "owner")
          .single();
        if (ownerRole?.id) {
          const { error: repairError } = await database
            .from("admin_users")
            .update({ role_id: ownerRole.id, active: true })
            .eq("id", existingRow.id);
          if (!repairError) {
            return { ok: true as const };
          }
        }
        return {
          ok: false as const,
          message: "Could not repair your admin account. Contact support.",
        };
      }
      return { ok: false as const, message: "An admin account already exists." };
    }
  }

  const { count: secondCount, error: secondError } = await database
    .from("admin_users")
    .select("id", { count: "exact", head: true });

  if (secondError || secondCount !== 0)
    return {
      ok: false as const,
      message: "An admin account was created first. Refresh to continue.",
    };

  // Look up the owner role UUID from the roles table (RBAC authority)
  const { data: ownerRole } = await database.from("roles").select("id").eq("key", "owner").single();

  const { error } = await database.from("admin_users").insert({
    clerk_user_id: session.userId,
    role: "owner",
    role_id: ownerRole?.id ?? null,
    active: true,
  });

  if (error) {
    console.error("First-run owner setup failed", { code: error.code });
    return { ok: false as const, message: "Your admin account could not be created. Try again." };
  }

  return { ok: true as const };
});

/**
 * Check whether the current Clerk user is the INITIAL_ADMIN_CLERK_USER_ID.
 * Used by the unauthorized page to auto-show the claim flow.
 */
export const checkIsInitialAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const initialAdminId = process.env.INITIAL_ADMIN_CLERK_USER_ID?.trim() || null;
  if (!initialAdminId) return { isInitialAdmin: false };

  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch {
    return { isInitialAdmin: false };
  }

  if (!session.isAuthenticated || !session.userId) return { isInitialAdmin: false };

  return { isInitialAdmin: session.userId === initialAdminId };
});

export const setAdminErrorStatus = createServerFn({ method: "POST" })
  .validator(z.object({ status: z.union([z.literal(403), z.literal(503)]) }))
  .handler(async ({ data }) => {
    setResponseStatus(data.status);
    setResponseHeader("Cache-Control", "private, no-store, max-age=0");
    return { ok: true as const };
  });
