"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getCurrentUser, getUserOrganizations, identityOf } from "@/lib/auth";
import { withUserSession, createInitialOrganizationForIdentityWithPlan, createOrganizationForIdentityWithType } from "@/lib/tenant";
import { slugify } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { acceptInvitationAction } from "@/app/(app)/settings/actions";
import { parseWorkspaceInput } from "@/lib/workspaceValidation";
import { safeErrorDiagnostic } from "@/lib/diagnostics";
import { getOnboardingState, setOnboardingState } from "@/lib/onboardingState";
import { normalizeInternationalPhone } from "@/lib/phoneNumber";
import { parseSelectablePlanKey } from "@/lib/plans";
import { z } from "zod";

const planSchema = z.enum(["free", "pro", "plus"]);
const workspaceTypeSchema = z.enum(["personal", "organization"]);
const detailsSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  phone: z.string().trim().min(7, "Phone number is required").max(40),
  name: z.string().trim().optional(),
});

function onboardingError(message: string, step: string): never {
  redirect(`/onboarding?step=${step}&error=${encodeURIComponent(message)}`);
}

export async function selectPlanAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = planSchema.safeParse(formData.get("plan"));
  if (!parsed.success) onboardingError("Choose a valid plan.", "plan");
  const identity = identityOf(user);
  const state = await getOnboardingState(identity);
  if (!state.workspaceType || !state.phone) onboardingError("Complete workspace details before choosing a plan.", state.workspaceType ? "details" : "workspace");
  try {
    await setOnboardingState(identity, { stage: "plan", plan: parsed.data });
  } catch (error) {
    console.error("[onboarding] plan selection failed", {
      stage: "plan_selection",
      plan: parsed.data,
      error: safeErrorDiagnostic(error),
    });
    onboardingError("We could not save your plan yet. Please try again.", "plan");
  }
  await finishWorkspace(user);
}

export async function selectWorkspaceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = workspaceTypeSchema.safeParse(formData.get("accountType"));
  if (!parsed.success) onboardingError("Choose how you will use Workflow.", "workspace");
  const identity = identityOf(user);
  const correlationId = crypto.randomUUID();
  try {
    await setOnboardingState(identity, { stage: "details", workspaceType: parsed.data });
  } catch (error) {
    console.error("[onboarding] workspace action failed", {
      correlationId,
      action: "selectWorkspaceAction",
      stage: "save_workspace_type",
      operation: "onboarding_state_update",
      accountType: parsed.data,
      error: safeErrorDiagnostic(error),
    });
    onboardingError("We could not save your workspace choice. Please try again.", "workspace");
  }
  redirect("/onboarding?step=details&draft=saved");
}

export async function completeDetailsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = detailsSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) onboardingError(parsed.error.issues[0]?.message ?? "Complete your details.", "details");
  const accountType = formData.get("accountType") === "organization" ? "organization" : "personal";
  if (accountType === "organization" && (!parsed.data.name || parsed.data.name.trim().length < 2)) {
    onboardingError("Organization name is required.", "details");
  }
  const phoneCountry = String(formData.get("phoneCountryDialCode") ?? "");
  const normalizedPhone = normalizeInternationalPhone(parsed.data.phone, phoneCountry);
  if (!normalizedPhone) onboardingError("Enter a valid phone number for the selected country.", "details");
  let profileSaveFailed = false;
  const identity = identityOf(user);
  if (user.clerkUserId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.users.updateUser(user.clerkUserId, { firstName: parsed.data.firstName, lastName: parsed.data.lastName });
    } catch {
      profileSaveFailed = true;
    }
  }
  if (profileSaveFailed) onboardingError("We could not save your profile yet. Please try again.", "details");
  try {
    await setOnboardingState(identity, {
      stage: "plan",
      phone: normalizedPhone,
      workspaceType: accountType,
      workspaceName: parsed.data.name?.trim() || null,
      phoneVerifiedAt: null,
    });
    await withUserSession(identity, async (tx) => {
      await tx.execute(sql`update public.users set name = ${`${parsed.data.firstName} ${parsed.data.lastName}`} where id = app.current_user_id()`);
    });
  } catch (error) {
    console.error("[onboarding] details action failed", {
      action: "completeDetailsAction",
      stage: "save_details",
      operation: "profile_and_onboarding_state_update",
      accountType,
      error: safeErrorDiagnostic(error),
    });
    onboardingError("We could not save your details yet. Please try again.", "details");
  }
  redirect("/onboarding?step=plan&draft=saved");
}

async function finishWorkspace(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const identity = identityOf(user);
  const state = await getOnboardingState(identity);
  const plan = parseSelectablePlanKey(state.plan);
  const workspaceType = state.workspaceType === "personal" || state.workspaceType === "organization" ? state.workspaceType : null;
  if (!state.phone || !state.plan || !workspaceType) {
    onboardingError("Complete your details before creating a workspace.", "details");
  }
  if (state.workspaceId) {
    const { setCurrentOrgCookie } = await import("@/lib/auth");
    await setCurrentOrgCookie(state.workspaceId);
    await setOnboardingState(identity, { stage: plan === "free" ? "complete" : "payment" });
    redirect(plan === "free" ? "/dashboard" : `/onboarding?step=billing&plan=${plan}`);
  }
  const memberships = await getUserOrganizations(user);
  if (memberships.length > 0) {
    const { setCurrentOrgCookie } = await import("@/lib/auth");
    await setCurrentOrgCookie(memberships[0].orgId);
    await setOnboardingState(identity, { stage: plan === "free" ? "complete" : "payment" });
    redirect(plan === "free" ? "/dashboard" : `/onboarding?step=billing&plan=${plan}`);
  }
  const firstName = user.name.trim().split(/\s+/)[0] || "My";
  const name = state.workspaceType === "personal" ? `${firstName}'s Workspace` : state.workspaceName?.trim() || "My Organization";
  const slug = slugify(name) || "workspace";
  let stage = "workspace_creation";
  let destination = "/dashboard";
  let setupFailed = false;
  try {
    const result = await createInitialOrganizationForIdentityWithPlan(identityOf(user), name, slug, workspaceType, plan);
    stage = "activity_log";
    await logActivity({ orgId: result.orgId, type: "org_created", message: workspaceType === "personal" ? `Personal workspace "${name}" created` : `Workspace "${name}" created` });
    stage = "current_workspace_cookie";
    const { setCurrentOrgCookie } = await import("@/lib/auth");
    await setCurrentOrgCookie(result.orgId);
    await setOnboardingState(identity, { stage: plan === "free" ? "complete" : "payment" });
    destination = plan === "free" ? "/dashboard" : `/onboarding?step=billing&plan=${plan}`;
  } catch (error) {
    console.error("[onboarding] workspace setup failed", { stage, error: safeErrorDiagnostic(error) });
    setupFailed = true;
  }
  if (setupFailed) onboardingError("We could not finish workspace setup. Please try again.", "details");
  redirect(destination);
}

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

  let stage = "membership_lookup";
  let destination = "/dashboard";
  let setupFailed = false;
  try {
    const memberships = await getUserOrganizations(user!);
    stage = memberships.length === 0 ? "workspace_creation" : "additional_workspace_creation";
    const result = memberships.length === 0
      ? await createInitialOrganizationForIdentityWithPlan(identityOf(user!), name, slug, accountType, plan)
      : { orgId: await createOrganizationForIdentityWithType(identityOf(user!), name, slug, accountType), created: true };
    const orgId = result.orgId;
    stage = "activity_log";
    await logActivity({
      orgId,
      type: "org_created",
      message:
        accountType === "personal"
          ? `Personal workspace "${name}" created`
          : `Workspace "${name}" created`,
    });

    stage = "current_workspace_cookie";
    const { setCurrentOrgCookie } = await import("@/lib/auth");
    await setCurrentOrgCookie(orgId);
    await setOnboardingState(identityOf(user!), { stage: plan === "free" ? "complete" : "payment", plan, workspaceType: accountType });
    destination = plan !== "free" && result.created ? `/onboarding?step=billing&plan=${plan}` : "/dashboard";
  } catch (error) {
    console.error("[onboarding] workspace setup failed", {
      stage,
      accountType,
      plan,
      error: safeErrorDiagnostic(error),
    });
    setupFailed = true;
  }
  if (setupFailed) redirect("/onboarding?error=" + encodeURIComponent("We could not finish workspace setup. Please try again."));
  redirect(destination);
}
