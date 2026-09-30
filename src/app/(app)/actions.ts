"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, identityOf, requireMembership, setCurrentOrgCookie } from "@/lib/auth";
import { createOrganizationForIdentity } from "@/lib/tenant";
import { slugify } from "@/lib/validation";
import { logActivity } from "@/lib/activity";

export async function switchOrgAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = String(formData.get("orgId") ?? "");
  const membership = await requireMembership(user!, orgId);
  if (membership) {
    await setCurrentOrgCookie(orgId);
  }
  redirect("/dashboard");
}

const createOrgSchema = z.object({ name: z.string().min(2, "Enter an organization name") });

export async function createOrganizationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createOrgSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const slug = slugify(parsed.data.name) || "workspace";
  // The database creates the organisation, its owner membership, subscription
  // and audit entry in one transaction and resolves slug collisions itself.
  const orgId = await createOrganizationForIdentity(identityOf(user!), parsed.data.name, slug);
  await logActivity({ orgId, type: "org_created", message: `Workspace "${parsed.data.name}" created` });
  await setCurrentOrgCookie(orgId);
  redirect("/dashboard");
}
