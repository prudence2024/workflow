import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, withUserContext, type Identity, type TenantTx } from "@/lib/tenant";
import { slugify } from "@/lib/validation";

/**
 * Workspace provisioning, membership and invitations.
 *
 * Every mutation here runs inside a transaction that (a) resolves the local
 * profile from the verified Clerk subject, (b) sets tenant context through the
 * membership-verifying database function, and (c) delegates the write to a
 * SECURITY DEFINER routine that re-checks permissions and escalation rules.
 * The client never supplies an owner id, a role id or a permission.
 */

export async function createOrganization(
  clerkUserId: string,
  name: string,
  slugBase?: string,
): Promise<string> {
  const base = slugify(slugBase ?? name) || "workspace";
  return withUserContext(clerkUserId, null, async (tx) => {
    const res = await tx.execute<{ id: string }>(
      sql`select app.create_organization(${name}, ${base}) as id`,
    );
    return res.rows[0].id;
  });
}

export async function inviteMember(
  clerkUserId: string,
  orgId: string,
  email: string,
  roleKey: string,
): Promise<string> {
  const res = await withUserContext(clerkUserId, orgId, async (tx) => {
    const r = await tx.execute<{ token: string }>(
      sql`select app.create_invitation(${orgId}::uuid, ${email}, ${roleKey}) as token`,
    );
    return r.rows;
  });
  return res[0].token;
}

export async function acceptInvitation(clerkUserId: string, token: string): Promise<string> {
  const res = await withUserContext(clerkUserId, null, async (tx) => {
    const r = await tx.execute<{ org_id: string }>(
      sql`select app.accept_invitation(${token}) as org_id`,
    );
    return r.rows;
  });
  return res[0].org_id;
}

export async function setMemberRole(
  clerkUserId: string,
  orgId: string,
  targetUserId: string,
  roleKey: string,
): Promise<void> {
  await withUserContext(clerkUserId, orgId, async (tx) => {
    await tx.execute(sql`select app.set_member_role(${orgId}::uuid, ${targetUserId}::uuid, ${roleKey})`);
  });
}

export async function setMemberStatus(
  clerkUserId: string,
  orgId: string,
  targetUserId: string,
  status: "active" | "suspended" | "revoked",
): Promise<void> {
  await withUserContext(clerkUserId, orgId, async (tx) => {
    await tx.execute(
      sql`select app.set_member_status(${orgId}::uuid, ${targetUserId}::uuid, ${status})`,
    );
  });
}

export type MemberRow = {
  userId: string;
  email: string;
  name: string;
  roleKey: string;
  status: string;
  createdAt: Date;
};

export async function listMembers(
  identity: Identity,
  orgId: string,
  fn: (tx: TenantTx) => Promise<MemberRow[]>,
): Promise<MemberRow[]> {
  return withTenant(identity, orgId, fn);
}

/** Consolidates the members list query used by the team settings screen. */
export async function queryMembers(tx: TenantTx, orgId: string): Promise<MemberRow[]> {
  const res = await tx.execute<{
    user_id: string;
    email: string;
    name: string;
    role_key: string;
    status: string;
    created_at: Date;
  }>(sql`
    select m.user_id, u.email, u.name,
           coalesce(r.key, m.role) as role_key,
           m.status, m.created_at
      from public.organization_members m
      join public.users u on u.id = m.user_id
      left join public.roles r on r.id = m.role_id
     where m.org_id = ${orgId}::uuid
     order by m.created_at
  `);

  return res.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    roleKey: r.role_key,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
};

export async function queryInvitations(tx: TenantTx, orgId: string): Promise<InvitationRow[]> {
  const res = await tx.execute<{
    id: string;
    email: string;
    role: string;
    status: string;
    expires_at: Date;
  }>(sql`
    select id, email, role, status, expires_at
      from public.organization_invitations
     where org_id = ${orgId}::uuid
     order by created_at desc
  `);

  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    expiresAt: r.expires_at,
  }));
}
