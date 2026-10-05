import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newToken } from "@/lib/id";
import { withUserContext, withUserSession, type Identity } from "@/lib/tenant";
import type { Role } from "@/lib/rbac";

const SESSION_COOKIE = "fops_session";
const ORG_COOKIE = "fops_org";
const CLERK_SESSION_COOKIE = "__session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// ---------------------------------------------------------------------------
// Identity
//
// Clerk owns credentials. This module resolves a *verified* Clerk subject to a
// local profile row, then resolves organisation membership from the database.
// The legacy password/session path is retained only as a transitional bridge
// for accounts created before the migration and is disabled whenever Clerk is
// configured. Remove it once the migration is verified complete.
// ---------------------------------------------------------------------------

function clerkErrorDetails(error: unknown): {
  errorName: string;
  errorCode: string | null;
  safeMessage: string;
} {
  const value = error as { name?: unknown; code?: unknown; message?: unknown };
  const rawMessage = typeof value?.message === "string" ? value.message : "unknown Clerk error";
  const safeMessage = rawMessage
    .replace(/(?:bearer|token|authorization)\s*[:=]?\s*\S+/gi, "[redacted]")
    .replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 240);
  return {
    errorName: typeof value?.name === "string" ? value.name : "UnknownError",
    errorCode: typeof value?.code === "string" ? value.code : null,
    safeMessage,
  };
}

function throwClerkOperationalError(stage: string, error: unknown): never {
  const details = clerkErrorDetails(error);
  console.error(`[auth] Clerk ${stage} failure`, details);
  throw new Error(`Clerk ${stage} failed; authentication service unavailable`);
}

export function isClerkConfigured(): boolean {
  // Server authentication only needs the secret key. The publishable key is a
  // client/build concern and may not be present in the Worker process even when
  // ClerkJS was bundled into the browser client.
  return Boolean(process.env.CLERK_SECRET_KEY);
}

/**
 * Which identity path this process is permitted to use.
 *
 *  - "clerk"        Clerk is configured and owns credentials.
 *  - "legacy"       Clerk is absent and we are NOT in production: the
 *                   transitional password bridge, so the app is exercisable on
 *                   a developer machine. Never available in production.
 *  - "unconfigured" Clerk is absent in production. Every request is treated as
 *                   unauthenticated. This is deliberate: a production
 *                   deployment must fail closed rather than silently fall back
 *                   to password sessions.
 */
export type AuthMode = "clerk" | "legacy" | "unconfigured";

export function authMode(): AuthMode {
  if (isClerkConfigured()) return "clerk";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "legacy";
}

/** True only for the non-production transitional bridge. */
export function legacyAuthAllowed(): boolean {
  return authMode() === "legacy";
}

/**
 * A navigation hint only. This is never accepted as authentication or
 * authorization; it lets a browser with a just-created Clerk session enter
 * the bounded server-readiness screen instead of bouncing between /login and
 * a protected route while auth() catches up.
 */
export async function hasClerkSessionHint(): Promise<boolean> {
  if (authMode() !== "clerk") return false;
  const store = await cookies();
  return Boolean(store.get(CLERK_SESSION_COOKIE)?.value);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  /** Clerk identity has both required Workflow name fields. */
  profileComplete: boolean;
  /** Authoritative platform-operator status, read from platform_admins. */
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  /** Present for Clerk-managed identities; null for legacy bridge sessions. */
  clerkUserId: string | null;
  /**
   * Transitional: the pre-Clerk session token, needed so the tenant gateway can
   * have the database verify it. Null once Clerk manages the identity. Never
   * send this value to a browser or a log.
   */
  legacySessionToken: string | null;
};

async function resolveClerkSubject(): Promise<string | null> {
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    console.info("[auth] Clerk session resolved", {
      authMode: "clerk",
      userIdPresent: Boolean(session?.userId),
    });
    return session?.userId ?? null;
  } catch (error) {
    return throwClerkOperationalError("server session resolution", error);
  }
}
/**
 * Provision or fetch the local profile row for a verified Clerk subject.
 * Identity values come from Clerk, never from request input.
 */
async function ensureLocalProfile(
  clerkUserId: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  profileComplete: boolean;
} | null> {
  let email: string | undefined;
  let name: string | undefined;
  let firstName = "";
  let lastName = "";

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress;
    firstName = clerkUser.firstName?.trim() ?? "";
    lastName = clerkUser.lastName?.trim() ?? "";
    name = [firstName, lastName].filter(Boolean).join(" ") || clerkUser.username || undefined;
    console.info("[auth] Clerk user lookup completed", {
      clerkSubjectPresent: true,
      clerkUserLookup: "success",
      primaryEmailPresent: Boolean(email),
      profileComplete: Boolean(firstName && lastName),
    });
  } catch (error) {
    return throwClerkOperationalError("user lookup", error);
  }

  if (!email) {
    console.error("[auth] Clerk user lookup returned no usable primary email", {
      clerkSubjectPresent: true,
      clerkUserLookup: "success",
      primaryEmailPresent: false,
    });
    throw new Error("Clerk profile cannot be provisioned");
  }

  // Do not manufacture an identity name from an email address. A new Clerk
  // account with missing name fields is routed through Workflow profile
  // completion immediately after the trusted session is ready.
  const resolvedName = name && name.trim() !== "" ? name : "Member";

  const rows = await db.execute<{ id: string }>(
    sql`select app.upsert_local_user(${clerkUserId}, ${email}, ${resolvedName}) as id`,
  );
  const id = rows.rows[0]?.id;
  if (!id) {
    console.error("[auth] local profile provisioning returned no user id", {
      clerkSubjectPresent: true,
      appUpsertLocalUser: "empty-result",
    });
    throw new Error("Local profile provisioning failed");
  }

  console.info("[auth] local profile provisioning completed", {
    clerkSubjectPresent: true,
    localUserIdPresent: true,
    profileComplete: Boolean(firstName && lastName),
  });
  return {
    id,
    email,
    name: resolvedName,
    firstName,
    lastName,
    profileComplete: Boolean(firstName && lastName),
  };
}

export async function isPlatformAdminSubject(clerkUserId: string): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(
    sql`select app.is_platform_admin_user(${clerkUserId}) as ok`,
  );
  return Boolean(rows.rows[0]?.ok);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const mode = authMode();

  // Production without Clerk credentials: refuse to authenticate anyone.
  if (mode === "unconfigured") return null;

  if (mode === "clerk") {
    const subject = await resolveClerkSubject();
    if (!subject) return null;

    const profile = await ensureLocalProfile(subject);
    if (!profile) return null;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileComplete: profile.profileComplete,
      isPlatformAdmin: await isPlatformAdminSubject(subject),
      emailVerified: true,
      clerkUserId: subject,
      legacySessionToken: null,
    };
  }

  return getLegacySessionUser();
}

/**
 * Revoke whatever credential this request presented. Used by the logout action
 * so a Clerk session is actually terminated rather than only the local cookie.
 */
export async function signOutCurrentIdentity(user: CurrentUser | null): Promise<void> {
  if (user?.clerkUserId) {
    try {
      const { auth, clerkClient } = await import("@clerk/nextjs/server");
      const session = await auth();
      if (session?.sessionId) {
        const client = await clerkClient();
        await client.sessions.revokeSession(session.sessionId);
      }
    } catch {
      // Fall through to cookie cleanup; the local session is cleared regardless.
    }
  }
  await destroySession();
}

/** Transitional bridge: pre-Clerk password sessions. Removable after migration. */
async function getLegacySessionUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isPlatformAdmin: users.isPlatformAdmin,
      emailVerified: users.emailVerified,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  const legacyNameParts = row.name.trim().split(/\s+/).filter(Boolean);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    firstName: legacyNameParts[0] ?? "",
    lastName: legacyNameParts.slice(1).join(" "),
    // The legacy bridge already collected its full-name field. Keep existing
    // development accounts usable while Clerk-managed identities use the
    // stricter first/last-name completion flow above.
    profileComplete: true,
    isPlatformAdmin: row.isPlatformAdmin,
    emailVerified: row.emailVerified,
    clerkUserId: null,
    legacySessionToken: token,
  };
}

/**
 * Turn a resolved user into the identity the tenant gateway accepts. Chooses the
 * strictest available proof: a Clerk subject when present, otherwise the session
 * token the database will verify.
 */
export function identityOf(user: CurrentUser): Identity {
  if (user.clerkUserId) return { kind: "clerk", clerkUserId: user.clerkUserId };
  if (user.legacySessionToken) return { kind: "legacy", sessionToken: user.legacySessionToken };
  // No verifiable identity: callers must treat this as unauthenticated.
  throw new Error("no verifiable identity for the current request");
}

export function hasVerifiableIdentity(user: CurrentUser): boolean {
  return Boolean(user.clerkUserId || user.legacySessionToken);
}

// ---------------------------------------------------------------------------
// Organisation resolution
//
// Accepts either the full current user or a plain id. When a Clerk subject is
// available, membership is resolved through the database function
// app.user_organizations(), which checks active membership itself — the
// application never trusts a browser-supplied organisation id.
// ---------------------------------------------------------------------------

export type OrgLookup =
  | CurrentUser
  | { id: string; clerkUserId?: string | null; legacySessionToken?: string | null }
  | string;

function lookup(lookupValue: OrgLookup): { id?: string; identity: Identity | null } {
  if (typeof lookupValue === "string") return { id: lookupValue, identity: null };
  if (lookupValue.clerkUserId) {
    return { id: lookupValue.id, identity: { kind: "clerk", clerkUserId: lookupValue.clerkUserId } };
  }
  if (lookupValue.legacySessionToken) {
    return {
      id: lookupValue.id,
      identity: { kind: "legacy", sessionToken: lookupValue.legacySessionToken },
    };
  }
  return { id: lookupValue.id, identity: null };
}

export type OrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  planKey: string;
  role: Role;
};

async function membershipsFromIdentity(identity: Identity): Promise<OrgMembership[]> {
  // Both routes go through app.user_organizations(), which resolves the caller
  // from the identity the database itself established (app.current_user_id()).
  // Application code never supplies a user id here, so a bug in this file
  // cannot widen a user's access to another workspace.
  const rows = await withUserSession(identity, async (tx) => {
    const result = await tx.execute<{
      org_id: string;
      org_name: string;
      org_slug: string;
      plan_key: string;
      role_key: string;
    }>(sql`select * from app.user_organizations()`);
    return result.rows;
  });

  return rows.map((r) => ({
    orgId: r.org_id,
    orgName: r.org_name,
    orgSlug: r.org_slug,
    planKey: r.plan_key,
    role: r.role_key as Role,
  }));
}

export async function getUserOrganizations(user: OrgLookup): Promise<OrgMembership[]> {
  const { identity } = lookup(user);
  if (!identity) return [];
  return membershipsFromIdentity(identity);
}

export async function setCurrentOrgCookie(orgId: string) {
  const store = await cookies();
  store.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * The active organisation is a *preference* stored in a cookie. It is only
 * honoured when the resolved membership list (from trusted data) contains it.
 */
export async function getCurrentOrg(user: OrgLookup): Promise<OrgMembership | null> {
  const memberships = await getUserOrganizations(user);
  if (memberships.length === 0) return null;

  const store = await cookies();
  const orgId = store.get(ORG_COOKIE)?.value;
  if (orgId) {
    const match = memberships.find((m) => m.orgId === orgId);
    if (match) return match;
  }
  return memberships[0];
}

export async function requireMembership(
  user: OrgLookup,
  orgId: string,
): Promise<OrgMembership | null> {
  if (!orgId) return null;
  const memberships = await getUserOrganizations(user);
  return memberships.find((m) => m.orgId === orgId) ?? null;
}

// ---------------------------------------------------------------------------
// Legacy session helpers (bridge only)
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  store.delete(SESSION_COOKIE);
  store.delete(ORG_COOKIE);
}
