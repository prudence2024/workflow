"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { campaignAudienceSnapshots, campaignRecords, campaigns, contactImports, contacts, customFieldDefinitions, messageTemplates, messages } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { suggestMapping } from "@/lib/formAnalysis";
import { analyzeFormUrl, providerForUrl } from "@/lib/formProviders";
import { queueFormAnalysis } from "@/lib/formAnalysisJobs";
import { parkRecordForReview, recomputeCampaignStats, resetFailedRecords } from "@/lib/submissionEngine";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";
import { renderTemplate } from "@/lib/email";
import { sql } from "drizzle-orm";
import { can, inWorkspace } from "@/lib/data";
import { assertPlanCapability, assertPlanLimit, PlanCapabilityError, PlanLimitError } from "@/lib/planLimits";
import { enqueueEvent } from "@/lib/outbox";
import { validatePrequeueContact } from "@/lib/prequeueValidation";

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

  let campaign: typeof campaigns.$inferSelect | null = null;
  let planLimitMessage: string | null = null;
  try {
    campaign = await inWorkspace({ user, org }, async (tx) => {
      await assertPlanLimit(tx, org.orgId, "activeCampaigns");
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
  } catch (error) {
    if (error instanceof PlanLimitError) planLimitMessage = error.message;
    else throw error;
  }
  if (planLimitMessage) redirect(`/campaigns/new?error=${encodeURIComponent(planLimitMessage)}`);
  if (!campaign) throw new Error("Campaign could not be created");

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

  // Browser-required providers are durable work on the edge. The request only
  // validates, authorizes and enqueues; a separate Node worker owns Chromium.
  if (providerForUrl(formUrl) === "google") {
    let queued: { status: string } | null;
    let queueError: string | null = null;
    try {
      queued = await queueFormAnalysis({ user, org }, campaignId, formUrl);
    } catch (err) {
      queued = null;
      queueError = err instanceof Error ? err.message : "Could not queue form analysis";
    }
    if (queueError) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(queueError));
    if (!queued) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Campaign not found"));
    revalidatePath(`/campaigns/${campaignId}`);
    redirect(`/campaigns/${campaignId}?analysis=queued`);
  }

  // Static standard forms can still be analyzed inline because they do not need
  // a browser. Ambiguous results remain visible and are never marked ready.
  let analyzed: Awaited<ReturnType<typeof analyzeFormUrl>> | null = null;
  let analysisError: string | null = null;
  try {
    analyzed = await analyzeFormUrl(formUrl);
  } catch (err) {
    analysisError = err instanceof Error ? err.message : "Could not analyze that form";
  }
  if (analysisError) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(analysisError));
  if (!analyzed) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Could not analyze that form"));

  if (analyzed.fields.length === 0) {
    const detail = analyzed.diagnostics[0] ?? "No form fields were detected on that page";
    redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent(detail));
  }

  let saveError = false;
  try {
    await inWorkspace({ user, org }, async (tx) => {
      const definitions = await tx.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
      const availableFields = ["firstName", "lastName", "email", "phone", "company", "address", ...definitions.map((d) => `custom__${d.key}`)];
      const suggested = suggestMapping(availableFields, analyzed.fields);

      await tx
        .update(campaigns)
        .set({ formUrl: analyzed.finalUrl, formDefinition: analyzed.fields, fieldMapping: suggested, formAnalysisStatus: analyzed.diagnostics.length > 0 ? "needs_attention" : "ready", formAnalysisError: analyzed.diagnostics[0] ?? null, formAnalysisUpdatedAt: new Date(), status: "draft", updatedAt: new Date() })
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
    });

    const detail =
      analyzed.diagnostics.length > 0
        ? ` (${analyzed.diagnostics[0]})`
        : "";
    await logActivity({ orgId: org.orgId, campaignId, type: "form_analyzed", message: `Analyzed form at ${analyzed.finalUrl} via ${analyzed.provider}: ${analyzed.fields.length} fields detected${detail}` });
    await incrementUsage(org.orgId, "form_analyses");
  } catch {
    saveError = true;
  }
  if (saveError) redirect(`/campaigns/${campaignId}?error=` + encodeURIComponent("Could not save the form analysis"));

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function saveFieldMappingAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  const saveResult = await inWorkspace({ user, org }, async (tx): Promise<"saved" | "missing" | "active"> => {
    const [campaign] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId))).limit(1);
    if (!campaign) return "missing";

    const activeRecords = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from public.campaign_records
       where campaign_id = ${campaignId}::uuid
         and status in ('queued', 'retrying', 'processing')
    `);
    if (campaign.status === "running" || (activeRecords.rows[0]?.n ?? 0) > 0) return "active";

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
    return "saved";
  });
  if (saveResult === "missing") redirect("/campaigns");
  if (saveResult === "active") redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Mapping is locked while this run is active.")}`);

  await logActivity({ orgId: org.orgId, campaignId, type: "mapping_saved", message: "Field mapping saved" });
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function addContactsToCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const mode = String(formData.get("mode") ?? "selected");

  let added = 0;
  let planLimitMessage: string | null = null;
  try {
    added = await inWorkspace({ user, org }, async (tx) => {
      const [campaign] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)))
      .limit(1);
      if (!campaign) return 0;

      // Bulk modes use INSERT…SELECT so a large workspace never becomes a
      // request-sized JavaScript array. The candidate count is bounded to one
      // integer for plan enforcement, while Postgres performs the set insert.
      if (mode === "all" || mode === "import") {
        const importId = String(formData.get("importId") ?? "");
        if (mode === "import" && !importId) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Choose an imported batch")}`);

        const source = mode === "import"
          ? sql`join public.contact_imports ci on ci.contact_id = c.id and ci.org_id = ${org.orgId}::uuid and ci.import_id = ${importId}::uuid`
          : sql``;
        const sourceGuard = mode === "import"
          ? sql`and exists (select 1 from public.imports i where i.id = ${importId}::uuid and i.org_id = ${org.orgId}::uuid and i.status = 'imported')`
          : sql``;
        const candidateCount = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n
            from public.contacts c
            ${source}
           where c.org_id = ${org.orgId}::uuid
             and c.archived_at is null
             ${sourceGuard}
             and not exists (
               select 1 from public.campaign_records cr
                where cr.campaign_id = ${campaignId}::uuid and cr.contact_id = c.id
             )
        `);
        const candidateTotal = Number(candidateCount.rows[0]?.n ?? 0);
        if (candidateTotal === 0) return 0;
        await assertPlanLimit(tx, org.orgId, "contacts", candidateTotal);
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into public.campaign_records (org_id, campaign_id, contact_id, status)
          select ${org.orgId}::uuid, ${campaignId}::uuid, c.id, 'queued'
            from public.contacts c
            ${source}
           where c.org_id = ${org.orgId}::uuid
             and c.archived_at is null
             ${sourceGuard}
             and not exists (
               select 1 from public.campaign_records cr
                where cr.campaign_id = ${campaignId}::uuid and cr.contact_id = c.id
             )
          returning id
        `);
        return inserted.rows.length;
      }

      // The checkbox UI is paginated; cap a forged/massive POST as a second
      // guardrail before it reaches SQL or the plan-limit calculation.
      const contactIds = formData.getAll("contactIds").map(String).filter(Boolean).slice(0, 1000);
      if (contactIds.length === 0) return 0;

      const ownedContacts = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, org.orgId), inArray(contacts.id, contactIds), isNull(contacts.archivedAt)))
        .limit(1000);
      const ownedContactIds = ownedContacts.map((contact) => contact.id);
      if (ownedContactIds.length === 0) return 0;

      const existing = await tx
        .select({ contactId: campaignRecords.contactId })
        .from(campaignRecords)
        .where(and(eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.orgId, org.orgId), inArray(campaignRecords.contactId, ownedContactIds)))
        .limit(1000);
    const existingSet = new Set(existing.map((e) => e.contactId));
      const toInsert = ownedContactIds.filter((id) => !existingSet.has(id));

      if (toInsert.length === 0) return 0;
      await assertPlanLimit(tx, org.orgId, "contacts", toInsert.length);
      await tx.insert(campaignRecords).values(toInsert.map((contactId) => ({ orgId: org.orgId, campaignId, contactId, status: "queued" })));
      return toInsert.length;
    });
  } catch (error) {
    if (error instanceof PlanLimitError) planLimitMessage = error.message;
    else throw error;
  }
  if (planLimitMessage) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(planLimitMessage)}`);
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

  // Enqueue-only: records stay queued and the real worker claims them durably.
  let queued;
  try {
    queued = await inWorkspace({ user, org }, async (tx) => {
      const campaignRows = await tx.execute<{ status: string; form_analysis_status: string; form_definition: unknown; field_mapping: Record<string, string> | null }>(sql`
        select status, form_analysis_status, form_definition, field_mapping from public.campaigns
        where id = ${campaignId}::uuid and org_id = ${org.orgId}::uuid limit 1
      `);
      const campaign = campaignRows.rows[0];
      if (!campaign) throw new Error("Campaign not found in this workspace.");
      if (campaign.status === "archived") throw new Error("Archived campaigns must be restored before they can run.");
      if (campaign.form_analysis_status !== "ready") throw new Error("Analyze the authorized form successfully before running this campaign.");
      const activeRecords = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from public.campaign_records
         where campaign_id = ${campaignId}::uuid
           and status in ('queued', 'retrying', 'processing')
      `);
      if (campaign.status === "running" || (activeRecords.rows[0]?.n ?? 0) > 0) {
        throw new Error("A campaign run is already active.");
      }
      const fields = Array.isArray(campaign.form_definition) ? campaign.form_definition as Array<{ pageIndex?: number; branchGroup?: string }> : [];
      const dynamic = fields.some((field) => (field.pageIndex ?? 0) > 0 || Boolean(field.branchGroup));
      if (dynamic) await assertPlanCapability(tx, org.orgId, "multi_page_forms");
      const definition = Array.isArray(campaign.form_definition)
        ? campaign.form_definition as Array<{ name: string; label?: string; required?: boolean }>
        : [];
      const mapping = campaign.field_mapping ?? {};
      const audience = await tx.execute<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        company: string | null;
        address: string | null;
        custom_fields: Record<string, string> | null;
      }>(sql`
        select r.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.address, c.custom_fields
          from public.campaign_records r
          join public.contacts c on c.id = r.contact_id
         where r.campaign_id = ${campaignId}::uuid
           and r.status in ('queued', 'retrying')
      `);
      for (const row of audience.rows) {
        const preflight = validatePrequeueContact({
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          address: row.address,
          customFields: row.custom_fields,
        }, definition, mapping);
        if (!preflight.valid) {
          await tx.execute(sql`
            update public.campaign_records
               set status = 'skipped', failure_category = 'validation_failed',
                   result_message = ${`Missing required form data: ${preflight.missing.join(", ")}`}, updated_at = now()
             where id = ${row.id}::uuid
          `);
        }
      }
      const rows = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from public.campaign_records
        where campaign_id = ${campaignId}::uuid and status in ('queued', 'retrying')
      `);
      await assertPlanLimit(tx, org.orgId, "submissionsPerMonth", rows.rows[0]?.n ?? 0);
      const snapshotRows = await tx.execute<{ contact_id: string }>(sql`
        select contact_id from public.campaign_records
         where campaign_id = ${campaignId}::uuid and status in ('queued', 'retrying')
      `);
      const snapshotId = randomUUID();
      if (snapshotRows.rows.length > 0) {
        await tx.insert(campaignAudienceSnapshots).values(snapshotRows.rows.map((row) => ({
          snapshotId,
          orgId: org.orgId,
          campaignId,
          contactId: row.contact_id,
        }))).onConflictDoNothing();
      }
      await tx.update(campaigns).set({ audienceSnapshotId: snapshotRows.rows.length > 0 ? snapshotId : null, status: "running", updatedAt: new Date() }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
      return rows.rows[0]?.n ?? 0;
    });
  } catch (error) {
    if (error instanceof PlanLimitError || error instanceof PlanCapabilityError) {
      redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(error.message)}`);
    }
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Campaign could not be queued safely.")}`);
  }
  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_started", message: `Campaign run started — ${queued} record(s) queued for the submission worker` });

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}
export async function cancelCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));

  const cancelled = await inWorkspace({ user, org }, async (tx) => {
    await tx.update(campaigns).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId)));
    const res = await tx.execute<{ n: number }>(sql`
      update public.campaign_records
         set status = 'cancelled',
             result_message = 'Cancelled by the workspace — never submitted.',
             updated_at = now()
       where campaign_id = ${campaignId}::uuid
         and status in ('queued', 'retrying')
      returning 1
    `);
    return res.rows.length;
  });
  await recomputeCampaignStats(org.orgId, campaignId);
  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_cancelled", message: `Campaign cancelled — ${cancelled} queued record(s) withdrawn before submission` });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function parkRecordAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  const recordId = String(formData.get("recordId"));
  await parkRecordForReview(org.orgId, campaignId, recordId, "Parked for human review from the campaign queue.");
  await recomputeCampaignStats(org.orgId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
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

export async function unarchiveCampaignAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const campaignId = String(formData.get("campaignId"));
  await inWorkspace({ user, org }, async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: "draft", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, org.orgId), eq(campaigns.status, "archived")));
  });
  await logActivity({ orgId: org.orgId, campaignId, type: "campaign_unarchived", message: "Campaign restored to draft" });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
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
