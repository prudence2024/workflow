"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { organizationMembers, organizations, subscriptions } from "@/db/schema";
import { getCurrentUser, requireMembership, setCurrentOrgCookie } from "@/lib/auth";
import { slugify } from "@/lib/validation";
import { eq } from "drizzle-orm";
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

  let slug = slugify(parsed.data.name) || "workspace";
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const clash = await db.select().from(organizations).where(eq(organizations.slug, candidate)).limit(1);
    if (clash.length === 0) {
      slug = candidate;
      break;
    }
    attempt += 1;
  }

  const [org] = await db.insert(organizations).values({ name: parsed.data.name, slug, planKey: "free" }).returning();
  await db.insert(organizationMembers).values({ orgId: org.id, userId: user!.id, role: "owner" });
  await db.insert(subscriptions).values({ orgId: org.id, planKey: "free", status: "active" });
  await logActivity({ orgId: org.id, type: "org_created", message: `Workspace "${org.name}" created` });
  await setCurrentOrgCookie(org.id);
  redirect("/dashboard");
}
