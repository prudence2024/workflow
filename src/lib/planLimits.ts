import "server-only";

import { sql } from "drizzle-orm";
import { capabilityMessage, hasCapability, parsePlanKey, PLANS, type PlanCapability, type PlanKey } from "@/lib/plans";
import type { TenantTx } from "@/lib/tenant";

export type PlanLimitMetric = "contacts" | "activeCampaigns" | "users" | "submissionsPerMonth";

export class PlanCapabilityError extends Error {
  readonly capability: PlanCapability;
  constructor(capability: PlanCapability) { super(capabilityMessage(capability)); this.name = "PlanCapabilityError"; this.capability = capability; }
}

export class PlanLimitError extends Error {
  readonly metric: PlanLimitMetric;
  readonly limit: number;
  constructor(metric: PlanLimitMetric, limit: number) { super(`The active plan limit for ${metric} is ${limit}. Choose a larger plan before continuing.`); this.name = "PlanLimitError"; this.metric = metric; this.limit = limit; }
}

export class AiQuotaError extends Error {
  readonly limit: number;
  constructor(limit: number) { super(`Workflow AI usage is limited to ${limit.toLocaleString()} requests per month on this plan.`); this.name = "AiQuotaError"; this.limit = limit; }
}

export async function assertPlanLimit(tx: TenantTx, orgId: string, metric: PlanLimitMetric, additional = 1): Promise<void> {
  const planRows = await tx.execute<{ plan_key: string }>(sql`select plan_key from public.organizations where id = ${orgId}::uuid limit 1`);
  const planKey = parsePlanKey(planRows.rows[0]?.plan_key) as PlanKey;
  const plan = PLANS[planKey] ?? PLANS.free;
  let current = 0;
  if (metric === "contacts") {
    const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from public.contacts where org_id = ${orgId}::uuid and archived_at is null`);
    current = rows.rows[0]?.n ?? 0;
  } else if (metric === "activeCampaigns") {
    const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from public.campaigns where org_id = ${orgId}::uuid and status in ('draft','ready','running','paused')`);
    current = rows.rows[0]?.n ?? 0;
  } else if (metric === "users") {
    const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from public.organization_members where org_id = ${orgId}::uuid and status = 'active'`);
    current = rows.rows[0]?.n ?? 0;
  } else {
    const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from public.campaign_records where org_id = ${orgId}::uuid and created_at >= date_trunc('month', now()) and status in ('processing','successful','failed','retrying','human_action_required','needs_attention')`);
    current = rows.rows[0]?.n ?? 0;
  }
  const limit = plan.limits[metric];
  if (current + additional > limit) throw new PlanLimitError(metric, limit);
}

export async function assertPlanCapability(tx: TenantTx, orgId: string, capability: PlanCapability): Promise<void> {
  const rows = await tx.execute<{ plan_key: string }>(sql`select plan_key from public.organizations where id = ${orgId}::uuid limit 1`);
  if (!hasCapability(rows.rows[0]?.plan_key ?? "free", capability)) throw new PlanCapabilityError(capability);
}

/** Atomically reserves one request so concurrent tabs cannot overrun the AI quota. */
export async function reserveAiRequest(tx: TenantTx, orgId: string): Promise<void> {
  const rows = await tx.execute<{ plan_key: string }>(sql`select plan_key from public.organizations where id = ${orgId}::uuid limit 1`);
  const plan = PLANS[parsePlanKey(rows.rows[0]?.plan_key)];
  const result = await tx.execute(sql`
    insert into public.usage_counters (org_id, metric, period_start, count)
    values (${orgId}::uuid, 'ai_requests', date_trunc('month', current_date)::date, 1)
    on conflict (org_id, metric, period_start)
    do update set count = public.usage_counters.count + 1
      where public.usage_counters.count < ${plan.aiLimits.requests}
    returning count
  `);
  if (result.rows.length === 0) throw new AiQuotaError(plan.aiLimits.requests);
}