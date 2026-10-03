"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizationInvitations, organizations, users } from "@/db/schema";
import {
  getCurrentOrg,
  getCurrentUser,
  hashPassword,
  identityOf,
  requireMembership,
  setCurrentOrgCookie,
  verifyPassword,
} from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { inWorkspace } from "@/lib/data";
import { withUserSession } from "@/lib/tenant";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

async function requireOrgAndRole(minPermission: Parameters<typeof can>[1]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  if (!can(org.role, minPermission)) {
    redirect("/settings/organization?error=" + encodeURIComponent("You do not have permission to perform this action"));
  }
  return { user: user!, org };
}

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

export async function renameOrganizationAction(formData: FormData) {
  const { user, org } = await requireOrgAndRole("org:manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/settings/organization?error=" + encodeURIComponent("Organization name is required"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx.update(organizations).set({ name }).where(eq(organizations.id, org.orgId));
  });
  await logActivity({ orgId: org.orgId, type: "org_renamed", message: `Workspace renamed to "${name}"` });
  revalidatePath("/settings/organization");
}

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "manager", "member", "viewer"]),
});

export async function inviteMemberAction(formData: FormData) {
  const { user, org } = await requireOrgAndRole("members:manage");
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) {
    redirect("/settings/organization?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  const email = parsed.data.email.trim().toLowerCase();

  // The database mints the token, refuses the owner role, and audits the
  // invitation — the application cannot weaken any of those rules.
  const token = await inWorkspace({ user, org }, async (tx) => {
    const res = await tx.execute<{ token: string }>(
      sql`select app.create_invitation(${org.orgId}::uuid, ${email}, ${parsed.data.role}) as token`,
    );
    return res.rows[0].token;
  });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: `You're invited to join ${org.orgName} on Workflow`,
    html: `<p>You have been invited to join <strong>${org.orgName}</strong> as ${parsed.data.role}.</p><p><a href="${inviteUrl}">Accept invitation</a></p>`,
  });

  await logActivity({ orgId: org.orgId, type: "member_invited", message: `Invited ${email} as ${parsed.data.role}` });
  revalidatePath("/settings/organization");
}

export async function revokeInvitationAction(formData: FormData) {
  const { org } = await requireOrgAndRole("members:manage");
  const id = String(formData.get("id"));
  // The app role holds SELECT (not UPDATE) on organization_invitations by
  // design, so revocation uses the administrative connection with an explicit
  // org filter. Permission is enforced above by requireOrgAndRole.
  await db
    .update(organizationInvitations)
    .set({ status: "revoked" })
    .where(and(eq(organizationInvitations.id, id), eq(organizationInvitations.orgId, org.orgId)));
  revalidatePath("/settings/organization");
}

export async function updateMemberRoleAction(formData: FormData) {
  const { user, org } = await requireOrgAndRole("members:manage");
  const memberId = String(formData.get("memberId"));
  const role = String(formData.get("role")) as Role;
  await inWorkspace({ user, org }, async (tx) => {
    const res = await tx.execute<{ user_id: string }>(
      sql`select user_id from public.organization_members where id = ${memberId}::uuid and org_id = ${org.orgId}::uuid limit 1`,
    );
    if (res.rows.length === 0) return;
    // Definer function enforces permission, the last-owner rule and auditing.
    await tx.execute(sql`select app.set_member_role(${org.orgId}::uuid, ${res.rows[0].user_id}::uuid, ${role})`);
  });
  revalidatePath("/settings/organization");
}

export async function removeMemberAction(formData: FormData) {
  const { user, org } = await requireOrgAndRole("members:manage");
  const memberId = String(formData.get("memberId"));
  await inWorkspace({ user, org }, async (tx) => {
    const res = await tx.execute<{ user_id: string }>(
      sql`select user_id from public.organization_members where id = ${memberId}::uuid and org_id = ${org.orgId}::uuid limit 1`,
    );
    if (res.rows.length === 0) return;
    await tx.execute(sql`select app.set_member_status(${org.orgId}::uuid, ${res.rows[0].user_id}::uuid, 'revoked')`);
  });
  revalidatePath("/settings/organization");
}

export async function acceptInvitationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const token = String(formData.get("token"));

  let orgId: string;
  try {
    // No tenant context yet — the database matches the token to the signed-in
    // identity and performs the join itself.
    orgId = await withUserSession(identityOf(user!), async (tx) => {
      const res = await tx.execute<{ org_id: string }>(sql`select app.accept_invitation(${token}) as org_id`);
      return res.rows[0].org_id;
    });
  } catch {
    redirect(`/invite/${token}?error=` + encodeURIComponent("This invitation is no longer valid"));
  }

  await setCurrentOrgCookie(orgId);
  await logActivity({ orgId, type: "member_joined", message: `${user!.name} joined the workspace` });
  redirect("/dashboard");
}

const accountSchema = z.object({
  name: z.string().min(2, "Name is required"),
});

export async function updateAccountAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const parsed = accountSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    redirect("/settings/account?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }
  await inWorkspace({ user, org }, async (tx) => {
    await tx.update(users).set({ name: parsed.data.name }).where(eq(users.id, user.id));
  });
  revalidatePath("/settings/account");
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function changePasswordAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    redirect("/settings/account?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  // Credentials sit outside the app role's reach on purpose (workflow_app has
  // no UPDATE on password_hash), so this self-scoped credential change uses the
  // administrative connection.
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  // Accounts without a legacy hash have no password to change — credentials
  // are owned by Clerk for those identities.
  const legacyHash = row?.passwordHash;
  const valid = Boolean(legacyHash) && (await verifyPassword(parsed.data.currentPassword, legacyHash!));
  if (!valid) {
    redirect("/settings/account?error=" + encodeURIComponent("Current password is incorrect"));
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  redirect("/settings/account?success=1");
}

export { requireMembership };

// ---------------------------------------------------------------------------
// Account deletion (tombstone saga — see src/lib/accountDeletion.ts)
// ---------------------------------------------------------------------------

export async function deleteAccountAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "DELETE") {
    redirect("/settings/account?error=" + encodeURIComponent('Type DELETE to confirm account deletion'));
  }

  const { blockingWorkspaces, deletionImpact, executeDeletion } = await import("@/lib/accountDeletion");

  // Clerk identities resolve by subject; the transitional legacy bridge
  // resolves by the verified session token the database checks.
  const clerkUserId = user.clerkUserId;
  const impact = clerkUserId ? await deletionImpact(clerkUserId) : null;
  if (!impact) {
    redirect("/login");
  }

  const deletePersonal = formData.get("deletePersonal") === "on";
  const deleteOrgs = formData.getAll("deleteOrg").map(String);
  const blockers = blockingWorkspaces(impact, {
    deletePersonalWorkspaces: deletePersonal,
    deleteSoleOwnedWorkspaces: deleteOrgs,
  });
  if (blockers.length > 0) {
    redirect(
      "/settings/account?error=" +
        encodeURIComponent(
          `You are the sole owner of: ${blockers.join(", ")}. Transfer ownership or confirm workspace deletion first.`,
        ),
    );
  }
  // Personal workspaces you solely own must be explicitly deleted (their
  // data cascades); ones shared with other eligible members are simply left
  // by revoking your membership.
  const solePersonal = impact.memberships.filter((m) => m.workspaceType === "personal" && m.soleEligible);
  if (solePersonal.length > 0 && !deletePersonal) {
    redirect(
      "/settings/account?error=" +
        encodeURIComponent(
          `Confirm deletion of your personal workspace (${solePersonal.map((m) => m.orgName).join(", ")}) — its data will be removed with your account.`,
        ),
    );
  }

  try {
    await executeDeletion(impact, {
      deletePersonalWorkspaces: deletePersonal,
      deleteSoleOwnedWorkspaces: deleteOrgs,
    });
  } catch (err) {
    redirect("/settings/account?error=" + encodeURIComponent(err instanceof Error ? err.message : "Deletion failed partway — try again"));
  }

  // Clerk identity is deleted LAST so a failure here never leaves database
  // garbage: the tombstoned profile self-heals into a fresh profile on the
  // next sign-in, and a repeated request reports nothing to delete.
  if (clerkUserId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.users.deleteUser(clerkUserId);
    } catch (err) {
      const notFound =
        err instanceof Error && /not found|404/i.test(err.message);
      if (!notFound) {
        redirect(
          "/settings/account?error=" +
            encodeURIComponent("Workspace data was removed but the sign-in identity could not be deleted — try again"),
        );
      }
    }
  }

  const { destroySession } = await import("@/lib/auth");
  await destroySession();
  redirect("/?deleted=1");
}
