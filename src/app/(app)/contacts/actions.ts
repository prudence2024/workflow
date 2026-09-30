"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contactTags, contacts, customFieldDefinitions, notes, tags } from "@/db/schema";
import { getCurrentOrg, getCurrentUser, requireMembership } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { inWorkspace } from "@/lib/data";
import { normalizeEmail, normalizePhone, slugify } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  company: z.string().optional().default(""),
  address: z.string().optional().default(""),
  nextAction: z.string().optional().default(""),
});

function extractCustomFields(formData: FormData, definitions: { key: string }[]) {
  const values: Record<string, string> = {};
  for (const def of definitions) {
    const value = formData.get(`custom__${def.key}`);
    if (value !== null) values[def.key] = String(value);
  }
  return values;
}

export async function createContactAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/contacts/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  // Writes run as `workflow_app` with a database-verified tenant context, so a
  // missing org filter is caught by row level security rather than trusted.
  const contact = await inWorkspace({ user, org }, async (tx) => {
    const definitions = await tx
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.orgId, org.orgId));
    const customFields = extractCustomFields(formData, definitions);

    const [created] = await tx
      .insert(contacts)
      .values({
        orgId: org.orgId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? "",
        email: normalizeEmail(parsed.data.email) || null,
        phone: normalizePhone(parsed.data.phone) || null,
        company: parsed.data.company || null,
        address: parsed.data.address || null,
        nextAction: parsed.data.nextAction || null,
        customFields,
      })
      .returning();
    return created;
  });

  await logActivity({ orgId: org.orgId, contactId: contact.id, type: "contact_created", message: "Contact created manually" });
  await incrementUsage(org.orgId, "contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContactAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/contacts/${contactId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await inWorkspace({ user, org }, async (tx) => {
    const definitions = await tx
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.orgId, org.orgId));
    const customFields = extractCustomFields(formData, definitions);

    await tx
      .update(contacts)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? "",
        email: normalizeEmail(parsed.data.email) || null,
        phone: normalizePhone(parsed.data.phone) || null,
        company: parsed.data.company || null,
        address: parsed.data.address || null,
        nextAction: parsed.data.nextAction || null,
        customFields,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.orgId)));
  });

  await logActivity({ orgId: org.orgId, contactId, type: "contact_updated", message: "Contact details updated" });
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}

export async function archiveContactAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .update(contacts)
      .set({ archivedAt: new Date(), status: "archived" })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.orgId)));
  });
  await logActivity({ orgId: org.orgId, contactId, type: "contact_archived", message: "Contact archived" });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function restoreContactAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .update(contacts)
      .set({ archivedAt: null, status: "active" })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.orgId)));
  });
  await logActivity({ orgId: org.orgId, contactId, type: "contact_restored", message: "Contact restored" });
  revalidatePath(`/contacts/${contactId}`);
}

export async function addNoteAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`/contacts/${contactId}`);

  await inWorkspace({ user, org }, async (tx) => {
    await tx.insert(notes).values({ orgId: org.orgId, contactId, authorUserId: user.id, body });
  });
  await logActivity({ orgId: org.orgId, contactId, type: "note_added", message: "Note added" });
  revalidatePath(`/contacts/${contactId}`);
}

export async function addTagAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  const rawName = String(formData.get("tagName") ?? "").trim();
  if (!rawName) redirect(`/contacts/${contactId}`);

  await inWorkspace({ user, org }, async (tx) => {
    const existing = await tx
      .select()
      .from(tags)
      .where(and(eq(tags.orgId, org.orgId), eq(tags.name, rawName)))
      .limit(1);

    const tag =
      existing[0] ??
      (
        await tx
          .insert(tags)
          .values({ orgId: org.orgId, name: rawName, color: "brand" })
          .returning()
      )[0];

    await tx.insert(contactTags).values({ contactId, tagId: tag.id }).onConflictDoNothing();
  });
  await logActivity({ orgId: org.orgId, contactId, type: "tag_added", message: `Tag "${rawName}" added` });
  revalidatePath(`/contacts/${contactId}`);
}

export async function removeTagAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const contactId = String(formData.get("contactId"));
  const tagId = String(formData.get("tagId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx.delete(contactTags).where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
  });
  revalidatePath(`/contacts/${contactId}`);
}

export async function bulkArchiveAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const ids = formData.getAll("contactIds").map(String);
  if (ids.length > 0) {
    await inWorkspace({ user, org }, async (tx) => {
      await tx
        .update(contacts)
        .set({ archivedAt: new Date(), status: "archived" })
        .where(and(eq(contacts.orgId, org.orgId), inArray(contacts.id, ids)));
    });
  }
  revalidatePath("/contacts");
}

export async function createCustomFieldAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("fieldType") ?? "text");
  const optionsRaw = String(formData.get("options") ?? "");
  if (!label) redirect("/settings/fields?error=" + encodeURIComponent("Field label is required"));

  const key = slugify(label).replace(/-/g, "_");
  const options = optionsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .insert(customFieldDefinitions)
      .values({ orgId: org.orgId, key, label, fieldType, options })
      .onConflictDoNothing();
  });
  revalidatePath("/settings/fields");
  redirect("/settings/fields");
}

export async function deleteCustomFieldAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const id = String(formData.get("id"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .delete(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.orgId, org.orgId)));
  });
  revalidatePath("/settings/fields");
}

export { can, requireMembership };
