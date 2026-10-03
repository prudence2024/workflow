"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, identityOf } from "@/lib/auth";
import { createOrganizationForIdentityWithType } from "@/lib/tenant";
import { slugify } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { acceptInvitationAction } from "@/app/(app)/settings/actions";

export { acceptInvitationAction };

const workspaceSchema = z.object({
  accountType: z.enum(["personal", "organization"]),
  name: z.string().optional().default(""),
});

/**
 * One secure workspace model for both account types (design-toolkit: prefer
 * the existing primitive). A personal workspace is a real tenant row with
 * workspace_type='personal' — RLS, tenant scoping and OrgSwitcher behavior
 * are identical; conversion to a team is a rename, not a migration.
 */
export async function createWorkspaceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = workspaceSchema.safeParse({
    accountType: formData.get("accountType"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    redirect("/onboarding?error=" + encodeURIComponent("Choose how you will use Workflow"));
  }

  const { accountType } = parsed.data;
  const rawName = parsed.data.name.trim();
  if (accountType === "organization" && rawName.length < 2) {
    redirect("/onboarding?error=" + encodeURIComponent("Enter an organization name"));
  }

  // Personal workspaces never require a name: derive a sensible default.
  const firstName = user.name.trim().split(/\s+/)[0] || "My";
  const name = accountType === "personal" ? `${firstName}'s Workspace` : rawName;
  const slug = slugify(name) || "workspace";

  // The database creates the organisation, its owner membership, subscription
  // and audit entry in one transaction and resolves slug collisions itself.
  const orgId = await createOrganizationForIdentityWithType(identityOf(user!), name, slug, accountType);

  await logActivity({
    orgId,
    type: "org_created",
    message:
      accountType === "personal"
        ? `Personal workspace "${name}" created`
        : `Workspace "${name}" created`,
  });

  const { setCurrentOrgCookie } = await import("@/lib/auth");
  await setCurrentOrgCookie(orgId);
  redirect("/dashboard");
}
