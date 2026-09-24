"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Email body is required"),
});

export async function createTemplateAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    redirect("/templates?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  await db.insert(messageTemplates).values({ orgId: org.orgId, ...parsed.data });
  revalidatePath("/templates");
  redirect("/templates");
}

export async function updateTemplateAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const id = String(formData.get("id"));
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    redirect(`/templates/${id}?error=` + encodeURIComponent(parsed.error.issues[0].message));
  }

  await db
    .update(messageTemplates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(messageTemplates.id, id), eq(messageTemplates.orgId, org.orgId)));
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const id = String(formData.get("id"));
  await db.delete(messageTemplates).where(and(eq(messageTemplates.id, id), eq(messageTemplates.orgId, org.orgId)));
  revalidatePath("/templates");
}
