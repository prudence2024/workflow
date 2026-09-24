"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizationInvitations, organizationMembers, organizations, users } from "@/db/schema";
import { getCurrentOrg, getCurrentUser, hashPassword, requireMembership, verifyPassword } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { newToken } from "@/lib/id";
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

export async function renameOrganizationAction(formData: FormData) {
  const { org } = await requireOrgAndRole("org:manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/settings/organization?error=" + encodeURIComponent("Organization name is required"));
  await db.update(organizations).set({ name }).where(eq(organizations.id, org.orgId));
  await logActivity({ orgId: org.orgId, type: "org_renamed", message: `Workspace renamed to "${name}"` });
  revalidatePath("/settings/organization");
}

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "manager", "member", "viewer"]),
});

export async function inviteMemberAction(formData: FormData) {
  const { org, user } = await requireOrgAndRole("members:manage");
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) {
    redirect("/settings/organization?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  const email = parsed.data.email.trim().toLowerCase();
  const token = newToken(20);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await db.insert(organizationInvitations).values({
    orgId: org.orgId,
    email,
    role: parsed.data.role,
    token,
    invitedByUserId: user.id,
    expiresAt,
  });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: `You're invited to join ${org.orgName} on FormflowOps`,
    html: `<p>You have been invited to join <strong>${org.orgName}</strong> as ${parsed.data.role}.</p><p><a href="${inviteUrl}">Accept invitation</a></p>`,
  });

  await logActivity({ orgId: org.orgId, type: "member_invited", message: `Invited ${email} as ${parsed.data.role}` });
  revalidatePath("/settings/organization");
}

export async function revokeInvitationAction(formData: FormData) {
  const { org } = await requireOrgAndRole("members:manage");
  const id = String(formData.get("id"));
  await db
    .update(organizationInvitations)
    .set({ status: "revoked" })
    .where(and(eq(organizationInvitations.id, id), eq(organizationInvitations.orgId, org.orgId)));
  revalidatePath("/settings/organization");
}

export async function updateMemberRoleAction(formData: FormData) {
  const { org } = await requireOrgAndRole("members:manage");
  const memberId = String(formData.get("memberId"));
  const role = String(formData.get("role")) as Role;
  await db
    .update(organizationMembers)
    .set({ role })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, org.orgId)));
  revalidatePath("/settings/organization");
}

export async function removeMemberAction(formData: FormData) {
  const { org } = await requireOrgAndRole("members:manage");
  const memberId = String(formData.get("memberId"));
  await db.delete(organizationMembers).where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, org.orgId)));
  revalidatePath("/settings/organization");
}

export async function acceptInvitationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const token = String(formData.get("token"));

  const [invitation] = await db.select().from(organizationInvitations).where(eq(organizationInvitations.token, token)).limit(1);
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt.getTime() < Date.now()) {
    redirect("/invite/" + token + "?error=" + encodeURIComponent("This invitation is no longer valid"));
  }
  if (invitation!.email.toLowerCase() !== user!.email.toLowerCase()) {
    redirect("/invite/" + token + "?error=" + encodeURIComponent(`Please log in as ${invitation!.email} to accept this invitation`));
  }

  await db
    .insert(organizationMembers)
    .values({ orgId: invitation!.orgId, userId: user!.id, role: invitation!.role })
    .onConflictDoNothing();
  await db.update(organizationInvitations).set({ status: "accepted" }).where(eq(organizationInvitations.id, invitation!.id));
  await logActivity({ orgId: invitation!.orgId, type: "member_joined", message: `${user!.name} joined the workspace` });
  redirect("/dashboard");
}

const accountSchema = z.object({
  name: z.string().min(2, "Name is required"),
});

export async function updateAccountAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = accountSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    redirect("/settings/account?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, user!.id));
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

  const [row] = await db.select().from(users).where(eq(users.id, user!.id)).limit(1);
  // Accounts without a legacy hash have no password to change — credentials
  // are owned by Clerk for those identities.
  const legacyHash = row?.passwordHash;
  const valid = Boolean(legacyHash) && (await verifyPassword(parsed.data.currentPassword, legacyHash!));
  if (!valid) {
    redirect("/settings/account?error=" + encodeURIComponent("Current password is incorrect"));
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user!.id));
  redirect("/settings/account?success=1");
}

export { requireMembership };
