import { db } from "@/db";
import { usageCounters } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type UsageMetric =
  | "contacts"
  | "submissions"
  | "form_analyses"
  | "imports"
  | "emails"
  | "reports";

function periodStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function incrementUsage(orgId: string, metric: UsageMetric, amount = 1) {
  const period = periodStart();
  await db
    .insert(usageCounters)
    .values({ orgId, metric, periodStart: period, count: amount })
    .onConflictDoUpdate({
      target: [usageCounters.orgId, usageCounters.metric, usageCounters.periodStart],
      set: { count: sql`${usageCounters.count} + ${amount}` },
    });
}

export async function getUsageForOrg(orgId: string) {
  const period = periodStart();
  const rows = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.orgId, orgId), eq(usageCounters.periodStart, period)));
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.metric] = row.count;
  }
  return map;
}
