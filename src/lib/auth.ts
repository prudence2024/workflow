import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newToken } from "@/lib/id";
import { withUserContext } from "@/lib/tenant";
import type { Role } from "@/lib/rbac";

const SESSION_COOKIE = "fops_session";
const ORG_COOKIE = "fops_org";
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

export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  /** Authoritative platform-operator status, read from platform_admins. */
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  /** Present for Clerk-managed identities; null for legacy bridge sessions. */
  clerkUserId: string | null;
};

async function resolveClerkSubject(): Promise<string | null> {
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Provision or fetch the local profile row for a verified Clerk subject.
 * Identity values come from Clerk, never from request input.
 */
async function ensureLocalProfile(
  clerkUserId: string,
): Promise<{ id: string; email: string; name: string } | null> {
  let email: string | undefined;
  let name: string | undefined;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress;
    name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      clerkUser.username ||
      undefined;
  } catch {
    // Without profile data we cannot provision a trustworthy local row.
    return null;
  }

  if (!email) return null;

  const resolvedName = name && name.trim() !== "" ? name : email.split("@")[0];

  const rows = await db.execute<{ id: string }>(
    sql`select app.upsert_local_user(${clerkUserId}, ${email}, ${resolvedName}) as id`,
  );
  const id = rows.rows[0]?.id;
  if (!id) return null;

  return { id, email, name: resolvedName };
}

export async function isPlatformAdminSubject(clerkUserId: string): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(
    sql`select app.is_platform_admin_user(${clerkUserId}) as ok`,
  );
  return Boolean(rows.rows[0]?.ok);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isClerkConfigured()) {
    const subject = await resolveClerkSubject();
    if (!subject) return null;

    const profile = await ensureLocalProfile(subject);
    if (!profile) return null;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      isPlatformAdmin: await isPlatformAdminSubject(subject),
      emailVerified: true,
      clerkUserId: subject,
    };
  }

  return getLegacySessionUser();
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

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isPlatformAdmin: row.isPlatformAdmin,
    emailVerified: row.emailVerified,
    clerkUserId: null,
  };
}

// ---------------------------------------------------------------------------
// Organisation resolution
//
// Accepts either the full current user or a plain id. When a Clerk subject is
// available, membership is resolved through the database function
// app.user_organizations(), which checks active membership itself — the
// application never trusts a browser-supplied organisation id.
// ---------------------------------------------------------------------------

export type OrgLookup = CurrentUser | { id: string; clerkUserId?: string | null } | string;

function lookup(lookupValue: OrgLookup): { id?: string; clerkUserId?: string | null } {
  if (typeof lookupValue === "string") return { id: lookupValue };
  return { id: lookupValue.id, clerkUserId: lookupValue.clerkUserId ?? null };
}

export type OrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  planKey: string;
  role: Role;
};

async function membershipsFromDatabase(clerkUserId: string): Promise<OrgMembership[]> {
  const rows = await withUserContext(clerkUserId, null, async (tx) => {
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

async function membershipsFromLegacy(userId: string): Promise<OrgMembership[]> {
  const rows = await db.execute<{
    org_id: string;
    org_name: string;
    org_slug: string;
    plan_key: string;
    role_key: string;
  }>(sql`
    select o.id as org_id, o.name as org_name, o.slug as org_slug, o.plan_key,
           coalesce(r.key, m.role) as role_key
      from public.organization_members m
      join public.organizations o on o.id = m.org_id
      left join public.roles r on r.id = m.role_id
     where m.user_id = ${userId}::uuid and m.status = 'active'
     order by o.created_at
  `);

  return rows.rows.map((r) => ({
    orgId: r.org_id,
    orgName: r.org_name,
    orgSlug: r.org_slug,
    planKey: r.plan_key,
    role: r.role_key as Role,
  }));
}

export async function getUserOrganizations(user: OrgLookup): Promise<OrgMembership[]> {
  const { id, clerkUserId } = lookup(user);
  if (clerkUserId) return membershipsFromDatabase(clerkUserId);
  if (!id) return [];
  return membershipsFromLegacy(id);
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
