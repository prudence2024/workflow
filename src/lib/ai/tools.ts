import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { campaigns, contacts, imports } from "@/db/schema";
import { inWorkspace, type Workspace } from "@/lib/data";
import { type AiToolName } from "./types";
import { toolArgumentSchema } from "./schemas";

export async function executeAiTool(workspace: Workspace, name: AiToolName, rawArgs: unknown): Promise<Record<string, unknown>> {
  const args = toolArgumentSchema.parse(rawArgs ?? {});
  return inWorkspace(workspace, async (tx) => {
    if (name === "get_campaign_summary") {
      if (!args.campaignId) return { error: "campaignId is required" };
      const rows = await tx.execute(sql`
        select c.id, c.name, c.status, c.form_analysis_status, c.stats,
          (select count(*)::int from public.campaign_records r where r.campaign_id = c.id) as records
        from public.campaigns c where c.id = ${args.campaignId}::uuid and c.org_id = ${workspace.org.orgId}::uuid
      `);
      return { campaign: rows.rows[0] ?? null };
    }
    if (name === "get_campaign_failures") {
      if (!args.campaignId) return { error: "campaignId is required" };
      const rows = await tx.execute(sql`
        select status, failure_category, count(*)::int as count
        from public.campaign_records
        where campaign_id = ${args.campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid
          and status in ('failed','needs_attention','human_action_required','unverified')
        group by status, failure_category order by count desc
      `);
      return { failures: rows.rows };
    }
    if (name === "get_form_structure" || name === "get_mapping_status") {
      if (!args.campaignId) return { error: "campaignId is required" };
      const rows = await tx.execute<{ form_definition: unknown; field_mapping: Record<string, string> | null; form_analysis_status: string; form_analysis_error: string | null }>(sql`
        select form_definition, field_mapping, form_analysis_status, form_analysis_error from public.campaigns
        where id = ${args.campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid
      `);
      const row = rows.rows[0];
      if (!row) return { campaign: null };
      const fields = Array.isArray(row.form_definition) ? row.form_definition : [];
      const mapping = row.field_mapping ?? {};
      return {
        status: row.form_analysis_status,
        error: row.form_analysis_error,
        fields,
        mapped: Object.keys(mapping).filter((key) => Boolean(mapping[key])).length,
        total: fields.length,
      };
    }
    if (name === "get_contact_data_quality_summary") {
      const rows = await tx.execute(sql`
        select count(*)::int as total,
          count(*) filter (where email is null or trim(email) = '')::int as missing_email,
          count(*) filter (where phone is null or trim(phone) = '')::int as missing_phone
        from public.contacts where org_id = ${workspace.org.orgId}::uuid and archived_at is null
      `);
      return { contacts: rows.rows[0] ?? { total: 0, missing_email: 0, missing_phone: 0 } };
    }
    if (name === "list_recent_imports") {
      const rows = await tx.select({ id: imports.id, fileName: imports.fileName, status: imports.status, validRows: imports.validRows, invalidRows: imports.invalidRows, createdAt: imports.createdAt }).from(imports).where(eq(imports.orgId, workspace.org.orgId)).orderBy(desc(imports.createdAt)).limit(10);
      return { imports: rows };
    }
    if (name === "get_usage_summary") {
      const rows = await tx.execute(sql`
        select metric, count from public.usage_counters
        where org_id = ${workspace.org.orgId}::uuid and period_start = date_trunc('month', current_date)::date
      `);
      return { usage: rows.rows };
    }
    if (name === "prepare_campaign_draft") {
      const rows = await tx.execute(sql`
        select count(*)::int as contacts from public.contacts where org_id = ${workspace.org.orgId}::uuid and archived_at is null
      `);
      return { proposal: { action: "create_draft", contactCount: rows.rows[0]?.contacts ?? 0, requiresConfirmation: true } };
    }
    return { error: "Unknown tool" };
  });
}