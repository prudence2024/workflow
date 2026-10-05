"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, getUserOrganizations, identityOf } from "@/lib/auth";
import { createInitialOrganizationForIdentityWithPlan, createOrganizationForIdentityWithType } from "@/lib/tenant";
import { slugify } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { acceptInvitationAction } from "@/app/(app)/settings/actions";
import { parseWorkspaceInput } from "@/lib/workspaceValidation";

export { acceptInvitationAction };

/**
 * One secure workspace model for both account types (design-toolkit: prefer
 * the existing primitive). A personal workspace is a real tenant row with
 * workspace_type='personal' — RLS, tenant scoping and OrgSwitcher behavior
 * are identical; conversion to a team is a rename, not a migration.
 */
export async function createWorkspaceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = parseWorkspaceInput({
    step: formData.get("step") ?? "workspace",
    plan: formData.get("plan") ?? "free",
    accountType: formData.get("accountType"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    redirect("/onboarding?error=" + encodeURIComponent("Choose how you will use Workflow"));
  }

  const plan = parsed.data.plan ?? "free";
  const { accountType } = parsed.data;
  const rawName = parsed.data.name.trim();

  // Personal workspaces never require a name: derive a sensible default.
  const firstName = user.name.trim().split(/\s+/)[0] || "My";
  const name = accountType === "personal" ? `${firstName}'s Workspace` : rawName;
  const slug = slugify(name) || "workspace";

  const memberships = await getUserOrganizations(user!);
  const result = memberships.length === 0
    ? await createInitialOrganizationForIdentityWithPlan(identityOf(user!), name, slug, accountType, plan)
    : { orgId: await createOrganizationForIdentityWithType(identityOf(user!), name, slug, accountType), created: true };
  const orgId = result.orgId;
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
  redirect(plan !== "free" && result.created ? `/onboarding?step=billing&plan=${plan}` : "/dashboard");
}
