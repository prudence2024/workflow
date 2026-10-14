import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { campaignAudienceSnapshots, campaigns } from "@/db/schema";
import { inWorkspace, type Workspace } from "@/lib/data";
import { assertPlanCapability, assertPlanLimit, PlanCapabilityError, PlanLimitError } from "@/lib/planLimits";
import { validatePrequeueContact, type PrequeueContact, type RequiredFormField } from "@/lib/prequeueValidation";

export type CampaignRunRecord = PrequeueContact & {
  id: string;
  orgId: string;
  campaignId: string;
  status: string;
};

export class CampaignRunValidationError extends Error {
  constructor(readonly code: "organization_mismatch" | "already_active" | "form_not_ready" | "no_queued_records" | "missing_required_data", message: string) {
    super(message);
    this.name = "CampaignRunValidationError";
  }
}

export type CampaignRunResult = { status: "running"; queuedCount: number };

/**
 * The single transactional campaign-start implementation used by both the
 * legacy Server Action and the authenticated API route. The campaign row is
 * locked before validation so concurrent requests cannot create two snapshots.
 */
export async function startCampaignRun(workspace: Workspace, campaignId: string): Promise<CampaignRunResult> {
  const queuedCount = await inWorkspace(workspace, async (tx) => {
    const campaignRows = await tx.execute<{
      org_id: string;
      status: string;
      form_analysis_status: string;
      form_definition: unknown;
      field_mapping: Record<string, string> | null;
    }>(sql`
      select org_id, status, form_analysis_status, form_definition, field_mapping from public.campaigns
      where id = ${campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid limit 1
      for update
    `);
    const campaign = campaignRows.rows[0];
    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status === "archived") throw new CampaignRunValidationError("form_not_ready", "Archived campaigns must be restored before they can run.");

    const activeRecords = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from public.campaign_records
       where campaign_id = ${campaignId}::uuid
         and org_id = ${workspace.org.orgId}::uuid
         and status in ('retrying', 'processing')
    `);
    const fields = Array.isArray(campaign.form_definition) ? campaign.form_definition as Array<{ pageIndex?: number; branchGroup?: string }> : [];
    if (fields.some((field) => (field.pageIndex ?? 0) > 0 || Boolean(field.branchGroup))) {
      await assertPlanCapability(tx, workspace.org.orgId, "multi_page_forms");
    }
    const definition = Array.isArray(campaign.form_definition)
      ? campaign.form_definition as Array<{ name: string; label?: string; required?: boolean }>
      : [];
    const mapping = campaign.field_mapping ?? {};
    const audience = await tx.execute<{
      id: string;
      org_id: string;
      campaign_id: string;
      status: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      address: string | null;
      custom_fields: Record<string, string> | null;
    }>(sql`
      select r.id, r.org_id, r.campaign_id, r.status, c.first_name, c.last_name, c.email, c.phone, c.company, c.address, c.custom_fields
        from public.campaign_records r
        join public.contacts c on c.id = r.contact_id
       where r.campaign_id = ${campaignId}::uuid
         and r.org_id = ${workspace.org.orgId}::uuid
         and r.status in ('queued', 'retrying')
    `);
    const records: CampaignRunRecord[] = audience.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      campaignId: row.campaign_id,
      status: row.status,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      address: row.address,
      customFields: row.custom_fields,
    }));
    validateCampaignRun({
      requestedOrgId: workspace.org.orgId,
      campaignOrgId: campaign.org_id,
      campaignId,
      campaignStatus: campaign.status,
      formAnalysisStatus: campaign.form_analysis_status,
      formDefinition: definition,
      fieldMapping: mapping,
      activeRecordCount: activeRecords.rows[0]?.n ?? 0,
      records,
    });

    const rows = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from public.campaign_records
      where campaign_id = ${campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid and status in ('queued', 'retrying')
    `);
    await assertPlanLimit(tx, workspace.org.orgId, "submissionsPerMonth", rows.rows[0]?.n ?? 0);
    const snapshotRows = await tx.execute<{ contact_id: string }>(sql`
      select contact_id from public.campaign_records
       where campaign_id = ${campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid and status in ('queued', 'retrying')
    `);
    const snapshotId = randomUUID();
    if (snapshotRows.rows.length > 0) {
      await tx.insert(campaignAudienceSnapshots).values(snapshotRows.rows.map((row) => ({
        snapshotId,
        orgId: workspace.org.orgId,
        campaignId,
        contactId: row.contact_id,
      }))).onConflictDoNothing();
    }
    await tx.update(campaigns)
      .set({ audienceSnapshotId: snapshotRows.rows.length > 0 ? snapshotId : null, status: "running", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, workspace.org.orgId)));
    return rows.rows[0]?.n ?? 0;
  });
  return { status: "running", queuedCount };
}

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign not found.");
    this.name = "CampaignNotFoundError";
  }
}

export function campaignRunErrorMessage(error: unknown): string {
  if (error instanceof CampaignRunValidationError || error instanceof PlanLimitError || error instanceof PlanCapabilityError || error instanceof CampaignNotFoundError) return error.message;
  return "Campaign could not be queued safely. Review the mapping, audience and plan limits, then try again.";
}

/** Activity history is secondary to the committed campaign transition. */
export async function bestEffortCampaignActivity(input: {
  write: () => Promise<void>;
  report: (error: unknown) => void;
}): Promise<void> {
  try {
    await input.write();
  } catch (error) {
    input.report(error);
  }
}

export function validateCampaignRun(input: {
  requestedOrgId: string;
  campaignOrgId: string;
  campaignId: string;
  campaignStatus: string;
  formAnalysisStatus: string;
  formDefinition: RequiredFormField[];
  fieldMapping: Record<string, string>;
  activeRecordCount: number;
  records: CampaignRunRecord[];
}): CampaignRunRecord[] {
  if (input.requestedOrgId !== input.campaignOrgId || input.records.some((record) => record.orgId !== input.requestedOrgId || record.campaignId !== input.campaignId)) {
    throw new CampaignRunValidationError("organization_mismatch", "Campaign records do not belong to this workspace.");
  }
  if (input.campaignStatus === "running" || input.activeRecordCount > 0) {
    throw new CampaignRunValidationError("already_active", "This campaign is already running. Wait for the current run to finish before queueing again.");
  }
  if (input.formAnalysisStatus !== "ready") {
    throw new CampaignRunValidationError("form_not_ready", "Analyze the authorized form successfully before running this campaign.");
  }

  const queued = input.records.filter((record) => record.status === "queued" || record.status === "retrying");
  if (queued.length === 0) {
    throw new CampaignRunValidationError("no_queued_records", "There are no queued records to run.");
  }

  const missing = queued.flatMap((record) => validatePrequeueContact(record, input.formDefinition, input.fieldMapping).missing);
  if (missing.length > 0) {
    throw new CampaignRunValidationError(
      "missing_required_data",
      `Complete required form data before queueing: ${[...new Set(missing)].join(", ")}`,
    );
  }
  return queued;
}
