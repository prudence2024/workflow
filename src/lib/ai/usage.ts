import "server-only";
import { sql } from "drizzle-orm";
import { inWorkspace, type Workspace } from "@/lib/data";

export async function recordAiUsage(workspace: Workspace, usage: {
  task: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  toolNames?: string[];
  outcome: "success" | "failure";
}): Promise<void> {
  await inWorkspace(workspace, async (tx) => {
    const metadata = JSON.stringify({
      task: usage.task,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      latencyMs: usage.latencyMs,
      toolNames: usage.toolNames ?? [],
      outcome: usage.outcome,
    });
    if ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) > 0) {
      await tx.execute(sql`
        insert into public.usage_counters (org_id, metric, period_start, count)
        values (${workspace.org.orgId}::uuid, 'ai_tokens', date_trunc('month', current_date)::date, ${Math.min(2147483647, (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0))})
        on conflict (org_id, metric, period_start)
        do update set count = public.usage_counters.count + excluded.count
      `);
    }
    await tx.execute(sql`
      insert into public.audit_logs (org_id, user_id, action, entity_type, metadata)
      values (${workspace.org.orgId}::uuid, app.current_user_id(), 'ai_request', 'ai', ${metadata}::jsonb)
    `);
  });
}