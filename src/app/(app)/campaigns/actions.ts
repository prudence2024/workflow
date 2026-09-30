"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { campaignRecords, campaigns, contacts, customFieldDefinitions, messageTemplates, messages } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { analyzeFormHtml, suggestMapping } from "@/lib/formAnalysis";
import { processCampaignRecords, recomputeCampaignStats, resetFailedRecords } from "@/lib/submissionEngine";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";
import { renderTemplate } from "@/lib/email";
import { sql } from "drizzle-orm";
import { can, inWorkspace } from "@/lib/data";
import { enqueueEvent } from "@/lib/outbox";

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
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

  const campaign = await inWorkspace({ user, org }, async (tx) => {
    const [created] = await tx
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
    return created;
  });

  await logActivity({ orgId: org.orgId, campaignId: campaign.id, type: "campaign_created", message: `Campaign "${campaign.name}" created` });

  if (parsed.data.formUrl) {
    redirect(`/campaigns/${campaign.id}?analyze=1`);
  }
  redirect(`/campaigns/${campaign.id}`);
}

export async function analyzeFormAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const formUrl = String(formData.get("formUrl") ?? "").trim();

  if (!formUrl || !/^https?:\/\//i.test(formUrl)) {
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Enter a valid, authorized form URL starting with http(s)://"));
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(formUrl, { signal: controller.signal, headers: { "User-Agent": "Workflow-FormAnalyzer/1.0" } });
    clearTimeout(timeout);

    if (!res.ok) {
      redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(`Could not fetch form (HTTP ${res.status})`));
    }

    const html = await res.text();
    const fields = analyzeFormHtml(html);

    if (fields.length === 0) {
      redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("No form fields were detected on that page"));
    }

    await inWorkspace({ user, org }, async (tx) => {
      const definitions = await tx.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
      const availableFields = ["firstName", "lastName", "email", "phone", "company", "address", ...definitions.map((d) => `custom__${d.key}`)];
      const suggested = suggestMapping(availableFields, fields);

      await tx
        .update(campaigns)
        .set({ formUrl, formDefinition: fields, fieldMapping: suggested, status: "draft", updatedAt: new Date() })
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
    });

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
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  const saved = await inWorkspace({ user, org }, async (tx) => {
    const [campaign] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId))).limit(1);
    if (!campaign) return false;

    const fields = (campaign.formDefinition as { name: string }[]) ?? [];
    const mapping: Record<string, string> = {};
    for (const field of fields) {
      const value = String(formData.get(`map__${field.name}`) ?? "");
      if (value) mapping[field.name] = value;
    }

    await tx
      .update(campaigns)
      .set({ fieldMapping: mapping, status: campaign.status === "draft" ? "ready" : campaign.status, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    return true;
  });
  if (!saved) redirect("/campaigns");

  await logActivity({ orgId: org.orgId, campaignId, type: "mapping_saved", message: "Field mapping saved" });
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function addContactsToCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const mode = String(formData.get("mode") ?? "selected");

  const added = await inWorkspace({ user, org }, async (tx) => {
    let contactIds: string[] = [];
    if (mode === "all") {
      const rows = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.orgId, org.orgId), isNull(contacts.archivedAt)));
      contactIds = rows.map((r) => r.id);
    } else {
      contactIds = formData.getAll("contactIds").map(String);
    }
    if (contactIds.length === 0) return 0;

    const existing = await tx
      .select({ contactId: campaignRecords.contactId })
      .from(campaignRecords)
      .where(and(eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.orgId, org.orgId)));
    const existingSet = new Set(existing.map((e) => e.contactId));
    const toInsert = contactIds.filter((id) => !existingSet.has(id));

    if (toInsert.length === 0) return 0;
    await tx.insert(campaignRecords).values(toInsert.map((contactId) => ({ orgId: org.orgId, campaignId, contactId, status: "queued" })));
    return toInsert.length;
  });
  if (added > 0) {
    await logActivity({ orgId: org.orgId, campaignId, type: "contacts_added", message: `${added} contacts added to campaign` });
  }

  await recomputeCampaignStats(org.orgId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function runCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  await inWorkspace({ user, org }, async (tx) => {
    await tx.update(campaigns).set({ status: "running", updatedAt: new Date() }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  });
  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_started", message: "Campaign run started" });

  // The submission engine stands in for the queue worker and runs under its own
  // context; the campaign status it returns is written back through the tenant
  // gateway below.
  const processed = await processCampaignRecords(org.orgId, campaignId);

  const stats = await recomputeCampaignStats(org.orgId, campaignId);
  const stillPending = (stats.queued ?? 0) + (stats.retrying ?? 0);
  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: stillPending > 0 ? "running" : "completed", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  });

  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_run_complete", message: `Processed ${processed} records this run` });

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function pauseCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx.update(campaigns).set({ status: "paused" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function archiveCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx.update(campaigns).set({ status: "archived" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
  });
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
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Choose a template first"));

  // Capability gate, resolved from the database for this tenant context.
  if (!(await can({ user, org }, "messages:send"))) {
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Your role cannot send communications."));
  }

  // Everything below happens as the restricted role with a verified tenant
  // context. Nothing here reports a message as sent: consent is checked first
  // and the send is *queued*.
  const outcome = await inWorkspace({ user, org }, async (tx) => {
    const template = await tx.execute<{ name: string; subject: string; body: string }>(sql`
      select name, subject, body from public.message_templates where id = ${templateId}::uuid
    `);
    if (template.rows.length === 0) return { error: "Template not found" };
    const tpl = template.rows[0];

    const campaign = await tx.execute<{ name: string }>(sql`
      select name from public.campaigns where id = ${campaignId}::uuid
    `);
    const campaignName = campaign.rows[0]?.name ?? "";

    // Consent + suppression are evaluated inside this transaction, so a revoked
    // address cannot slip through a race.
    const recipients = await tx.execute<{
      contact_id: string;
      first_name: string;
      last_name: string;
      address: string;
    }>(sql`
      select c.id as contact_id, c.first_name, c.last_name, c.email as address
        from public.campaign_records r
        join public.contacts c on c.id = r.contact_id
       where r.campaign_id = ${campaignId}::uuid
         and r.status = 'successful'
         and coalesce(c.email, '') <> ''
         and c.archived_at is null
         and exists (
           select 1 from public.contact_channel_consents cc
            where cc.contact_id = c.id and cc.channel = 'email' and cc.status = 'granted'
         )
         and not exists (
           select 1 from public.suppression_entries s
            where s.channel = 'email' and lower(s.address) = lower(c.email)
         )
    `);

    const skipped = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n
        from public.campaign_records r
        join public.contacts c on c.id = r.contact_id
       where r.campaign_id = ${campaignId}::uuid
         and r.status = 'successful'
         and not (coalesce(c.email, '') <> ''
                  and exists (select 1 from public.contact_channel_consents cc
                               where cc.contact_id = c.id and cc.channel = 'email' and cc.status = 'granted')
                  and not exists (select 1 from public.suppression_entries s
                                   where s.channel = 'email' and lower(s.address) = lower(c.email)))
    `);

    let queued = 0;
    let duplicate = 0;

    for (const recipient of recipients.rows) {
      const variables = {
        first_name: recipient.first_name,
        last_name: recipient.last_name,
        campaign: campaignName,
        organization: org.orgName,
        registration_status: "Confirmed",
      };
      const subject = renderTemplate(tpl.subject, variables);
      const body = renderTemplate(tpl.body, variables);

      const inserted = await tx.execute<{ id: string }>(sql`
        insert into public.messages
          (org_id, contact_id, campaign_id, template_id, channel, subject, body, status, provider)
        values (
          ${org.orgId}::uuid, ${recipient.contact_id}::uuid, ${campaignId}::uuid,
          ${templateId}::uuid, 'email', ${subject}, ${body}, 'queued', 'pending_provider'
        )
        returning id
      `);
      const messageId = inserted.rows[0].id;

      const enqueued = await enqueueEvent(tx, {
        orgId: org.orgId,
        eventType: "email",
        idempotencyKey: `campaign:${campaignId}:${templateId}:${recipient.contact_id}`,
        provider: "resend",
        resourceType: "message",
        resourceId: messageId,
        payload: {
          to: recipient.address,
          subject,
          html: body,
          messageId,
          contactId: recipient.contact_id,
        },
      });
      if (enqueued.enqueued) queued += 1;
      else duplicate += 1;
    }

    await tx.execute(sql`
      insert into public.activity_events (org_id, campaign_id, type, message)
      values (
        ${org.orgId}::uuid, ${campaignId}::uuid, 'emails_queued',
        ${`${queued} confirmation email(s) queued${skipped.rows[0]?.n ? `, ${skipped.rows[0].n} blocked by consent or suppression` : ""}`}
      )
    `);

    return { queued, duplicate, blocked: skipped.rows[0]?.n ?? 0 };
  });

  if ("error" in outcome) {
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(outcome.error!));
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(
    `/campaigns/${campaignId}?queued=${outcome.queued}&blocked=${outcome.blocked}${
      outcome.duplicate ? `&duplicate=${outcome.duplicate}` : ""
    }`,
  );
}
