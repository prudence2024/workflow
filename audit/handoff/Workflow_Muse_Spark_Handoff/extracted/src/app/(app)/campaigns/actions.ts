"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaignRecords, campaigns, contacts, customFieldDefinitions, messageTemplates, messages } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { analyzeFormHtml, suggestMapping } from "@/lib/formAnalysis";
import { processCampaignRecords, recomputeCampaignStats, resetFailedRecords } from "@/lib/submissionEngine";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";
import { renderTemplate, sendEmail } from "@/lib/email";

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!.id);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

const campaignSchema = z.object({
  name: z.string().min(2, "Campaign name is required"),
  type: z.string().min(1).default("custom"),
  formUrl: z.string().optional().default(""),
});

export async function createCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const parsed = campaignSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    formUrl: formData.get("formUrl"),
  });
  if (!parsed.success) {
    redirect("/campaigns/new?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      formUrl: parsed.data.formUrl || null,
      createdByUserId: user.id,
      stats: { total: 0 },
    })
    .returning();

  await logActivity({ orgId: org.orgId, campaignId: campaign.id, type: "campaign_created", message: `Campaign "${campaign.name}" created` });

  if (parsed.data.formUrl) {
    redirect(`/campaigns/${campaign.id}?analyze=1`);
  }
  redirect(`/campaigns/${campaign.id}`);
}

export async function analyzeFormAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const formUrl = String(formData.get("formUrl") ?? "").trim();

  if (!formUrl || !/^https?:\/\//i.test(formUrl)) {
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Enter a valid, authorized form URL starting with http(s)://"));
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(formUrl, { signal: controller.signal, headers: { "User-Agent": "FormflowOps-FormAnalyzer/1.0" } });
    clearTimeout(timeout);

    if (!res.ok) {
      redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(`Could not fetch form (HTTP ${res.status})`));
    }

    const html = await res.text();
    const fields = analyzeFormHtml(html);

    if (fields.length === 0) {
      redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("No form fields were detected on that page"));
    }

    const definitions = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
    const availableFields = ["firstName", "lastName", "email", "phone", "company", "address", ...definitions.map((d) => `custom__${d.key}`)];
    const suggested = suggestMapping(availableFields, fields);

    await db
      .update(campaigns)
      .set({ formUrl, formDefinition: fields, fieldMapping: suggested, status: "draft", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));

    await logActivity({ orgId: org.orgId, campaignId, type: "form_analyzed", message: `Analyzed form at ${formUrl}: ${fields.length} fields detected` });
    await incrementUsage(org.orgId, "form_analyses");
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "Request timed out" : "Could not reach that URL";
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(message));
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function saveFieldMappingAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId))).limit(1);
  if (!campaign) redirect("/campaigns");

  const fields = (campaign!.formDefinition as { name: string }[]) ?? [];
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const value = String(formData.get(`map__${field.name}`) ?? "");
    if (value) mapping[field.name] = value;
  }

  await db
    .update(campaigns)
    .set({ fieldMapping: mapping, status: campaign!.status === "draft" ? "ready" : campaign!.status, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await logActivity({ orgId: org.orgId, campaignId, type: "mapping_saved", message: "Field mapping saved" });
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function addContactsToCampaignAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const mode = String(formData.get("mode") ?? "selected");

  let contactIds: string[] = [];
  if (mode === "all") {
    const rows = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.orgId, org.orgId), isNull(contacts.archivedAt)));
    contactIds = rows.map((r) => r.id);
  } else {
    contactIds = formData.getAll("contactIds").map(String);
  }

  if (contactIds.length > 0) {
    const existing = await db
      .select({ contactId: campaignRecords.contactId })
      .from(campaignRecords)
      .where(and(eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.orgId, org.orgId)));
    const existingSet = new Set(existing.map((e) => e.contactId));
    const toInsert = contactIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await db.insert(campaignRecords).values(toInsert.map((contactId) => ({ orgId: org.orgId, campaignId, contactId, status: "queued" })));
      await logActivity({ orgId: org.orgId, campaignId, type: "contacts_added", message: `${toInsert.length} contacts added to campaign` });
    }
  }

  await recomputeCampaignStats(org.orgId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function runCampaignAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  await db.update(campaigns).set({ status: "running", updatedAt: new Date() }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_started", message: "Campaign run started" });

  const processed = await processCampaignRecords(org.orgId, campaignId);

  const stats = await recomputeCampaignStats(org.orgId, campaignId);
  const stillPending = (stats.queued ?? 0) + (stats.retrying ?? 0);
  await db
    .update(campaigns)
    .set({ status: stillPending > 0 ? "running" : "completed", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_run_complete", message: `Processed ${processed} records this run` });

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function pauseCampaignAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  await db.update(campaigns).set({ status: "paused" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function archiveCampaignAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  await db.update(campaigns).set({ status: "archived" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  revalidatePath("/campaigns");
  redirect("/campaigns");
}

export async function retryFailedAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const count = await resetFailedRecords(org.orgId, campaignId);
  await logActivity({ orgId: org.orgId, campaignId, type: "records_requeued", message: `${count} failed records requeued for retry` });
  await recomputeCampaignStats(org.orgId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function sendConfirmationEmailsAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Choose a template first"));

  const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.orgId, org.orgId))).limit(1);
  if (!template) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Template not found"));

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  const successfulRecords = await db
    .select({ contactId: campaignRecords.contactId, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
    .from(campaignRecords)
    .innerJoin(contacts, eq(campaignRecords.contactId, contacts.id))
    .where(and(eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.orgId, org.orgId), eq(campaignRecords.status, "successful")));

  let sent = 0;
  for (const record of successfulRecords) {
    if (!record.email) continue;
    const variables = {
      first_name: record.firstName,
      last_name: record.lastName,
      campaign: campaign?.name ?? "",
      organization: org.orgName,
      registration_status: "Confirmed",
    };
    const subject = renderTemplate(template!.subject, variables);
    const body = renderTemplate(template!.body, variables);
    const result = await sendEmail({ to: record.email, subject, html: body });

    await db.insert(messages).values({
      orgId: org.orgId,
      contactId: record.contactId,
      campaignId,
      templateId,
      subject,
      body,
      status: result.ok ? "sent" : "failed",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      errorMessage: result.error,
      sentAt: result.ok ? new Date() : null,
    });

    await logActivity({
      orgId: org.orgId,
      contactId: record.contactId,
      campaignId,
      type: result.ok ? "email_sent" : "email_failed",
      message: result.ok ? `Confirmation email sent: "${subject}"` : `Failed to send confirmation email`,
    });
    if (result.ok) sent += 1;
  }

  await incrementUsage(org.orgId, "emails", sent);
  await logActivity({ orgId: org.orgId, campaignId, type: "bulk_email_sent", message: `${sent} confirmation emails sent` });
  revalidatePath(`/campaigns/${campaignId}`);
}
