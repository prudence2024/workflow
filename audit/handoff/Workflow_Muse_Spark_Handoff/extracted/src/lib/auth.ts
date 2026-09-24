import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { organizationMembers, organizations, sessions, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newToken } from "@/lib/id";
import type { Role } from "@/lib/rbac";

const SESSION_COOKIE = "fops_session";
const ORG_COOKIE = "fops_org";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

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

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  emailVerified: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
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
  };
}

export type OrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  planKey: string;
  role: Role;
};

export async function getUserOrganizations(userId: string): Promise<OrgMembership[]> {
  const rows = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      planKey: organizations.planKey,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizations.createdAt);

  return rows.map((r) => ({ ...r, role: r.role as Role }));
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

export async function getCurrentOrg(userId: string): Promise<OrgMembership | null> {
  const store = await cookies();
  const orgId = store.get(ORG_COOKIE)?.value;
  const memberships = await getUserOrganizations(userId);
  if (memberships.length === 0) return null;

  if (orgId) {
    const match = memberships.find((m) => m.orgId === orgId);
    if (match) return match;
  }
  return memberships[0];
}

export async function requireMembership(userId: string, orgId: string): Promise<OrgMembership | null> {
  const rows = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      planKey: organizations.planKey,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.orgId, orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, role: row.role as Role };
}
