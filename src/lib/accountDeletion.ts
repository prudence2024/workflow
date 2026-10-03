import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Account deletion saga (security skill: fail closed, never trust browser
 * identity; session-security: session teardown is part of deletion).
 *
 * Tombstone design (no new tables, retry-safe, audit-preserving):
 *   - memberships are revoked explicitly;
 *   - a confirmed personal workspace is deleted by org row (FK cascades
 *     remove its tenant data; audit rows for that org cascade with it);
 *   - sole-owner organization workspaces BLOCK deletion until ownership is
 *     transferred or the workspace itself is explicitly deleted;
 *   - the users row is tombstoned (identity unlinked, PII cleared) rather
 *     than deleted, because audit_logs/campaigns/contacts reference it with
 *     ON DELETE NO ACTION — history stays intact without personal data;
 *   - the Clerk user is deleted LAST. If Clerk fails after tombstoning, a
 *     later sign-in simply provisions a fresh profile (self-healing), and a
 *     repeated deletion request reports "nothing to delete".
 */

export type DeletionImpact = {
  userId: string;
  email: string;
  memberships: {
    orgId: string;
    orgName: string;
    workspaceType: string;
    role: string;
    /** No other active owner/admin can take responsibility. */
    soleEligible: boolean;
  }[];
  personalWorkspaceIds: string[];
};

export async function deletionImpact(clerkUserId: string): Promise<DeletionImpact | null> {
  const users = await db.execute<{ id: string; email: string }>(
    sql`select id, email from public.users where clerk_user_id = ${clerkUserId}`,
  );
  if (users.rows.length === 0) return null;
  const user = users.rows[0];

  const rows = await db.execute<{
    org_id: string;
    org_name: string;
    workspace_type: string;
    role_key: string;
    other_eligible: number;
  }>(sql`
    select o.id as org_id, o.name as org_name,
           coalesce(o.workspace_type, 'organization') as workspace_type,
           coalesce(r.key, m.role) as role_key,
           (select count(*)::int from public.organization_members m2
              left join public.roles r2 on r2.id = m2.role_id
             where m2.org_id = o.id and m2.status = 'active'
               and m2.user_id <> ${user.id}::uuid
               and coalesce(r2.key, m2.role) in ('owner', 'admin')) as other_eligible
      from public.organization_members m
      join public.organizations o on o.id = m.org_id
      left join public.roles r on r.id = m.role_id
     where m.user_id = ${user.id}::uuid and m.status = 'active'
     order by o.created_at
  `);

  return {
    userId: user.id,
    email: user.email,
    memberships: rows.rows.map((r) => ({
      orgId: r.org_id,
      orgName: r.org_name,
      workspaceType: r.workspace_type,
      role: r.role_key,
      soleEligible: r.other_eligible === 0,
    })),
    personalWorkspaceIds: rows.rows.filter((r) => r.workspace_type === "personal").map((r) => r.org_id),
  };
}

export type DeletionPlan = {
  deletePersonalWorkspaces: boolean;
  deleteSoleOwnedWorkspaces: string[];
};

/**
 * Guard: every sole-eligible organization workspace must be explicitly
 * resolved (transfer done out-of-band, or workspace deletion confirmed).
 * Personal workspaces resolve by explicit deletion consent.
 */
export function blockingWorkspaces(impact: DeletionImpact, plan: DeletionPlan): string[] {
  const confirmed = new Set(plan.deleteSoleOwnedWorkspaces);
  return impact.memberships
    .filter(
      (m) =>
        m.soleEligible &&
        m.workspaceType === "organization" &&
        !confirmed.has(m.orgId),
    )
    .map((m) => m.orgName);
}

export async function executeDeletion(
  impact: DeletionImpact,
  plan: DeletionPlan,
): Promise<{ clerkUserId: string | null }> {
  const userId = impact.userId;

  await db.transaction(async (tx) => {
  // 1. Resolve workspace responsibility first (all-or-nothing per org).
  for (const m of impact.memberships) {
    if (m.workspaceType === "personal" && plan.deletePersonalWorkspaces && m.soleEligible) {
      // Org-row delete cascades tenant data (contacts, campaigns, imports,
      // messages, outbox, audit for that org) by FK design.
      await tx.execute(sql`delete from public.organizations where id = ${m.orgId}::uuid`);
      continue;
    }
    if (m.soleEligible && m.workspaceType === "organization") {
      if (plan.deleteSoleOwnedWorkspaces.includes(m.orgId)) {
        await tx.execute(sql`delete from public.organizations where id = ${m.orgId}::uuid`);
        continue;
      }
      throw new Error(`Workspace "${m.orgName}" would be orphaned — resolve ownership first`);
    }
    await tx.execute(
      sql`delete from public.organization_members where org_id = ${m.orgId}::uuid and user_id = ${userId}::uuid`,
    );
  }

  // 2. Sessions, platform-admin grant, and invitation ownership.
  await tx.execute(sql`delete from public.sessions where user_id = ${userId}::uuid`);
  await tx.execute(sql`update public.organization_invitations set invited_by_user_id = null where invited_by_user_id = ${userId}::uuid`);
  await tx.execute(
    sql`delete from public.platform_admins where user_id = ${userId}::uuid`,
  );

  // 3. Tombstone the profile: unlink identity, clear PII, keep referential
  // history (audit_logs and created_by references are NO ACTION).
  const tombstoneEmail = `deleted_${userId}@deleted.local`;
  await tx.execute(sql`
    update public.users
       set clerk_user_id = null,
           email = ${tombstoneEmail},
           name = 'Deleted user',
           password_hash = null,
           is_platform_admin = false,
           email_verified = false
     where id = ${userId}::uuid
  `);

  // 4. Clerk identity is deleted by the caller AFTER this resolves, so a
  // Clerk failure never leaves database garbage without a local record.
  });

  return { clerkUserId: null };
}
