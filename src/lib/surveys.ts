import "server-only";

import { sql } from "drizzle-orm";
import { inWorkspace, type Workspace } from "@/lib/data";
import { isSurveyDue, periodStart } from "@/lib/surveyPolicy";

export type WeeklySurveyState = { due: boolean; lastInteractionAt: Date | null };

export async function getWeeklySurveyState(workspace: Workspace): Promise<WeeklySurveyState> {
  try {
    return await inWorkspace(workspace, async (tx) => {
      const result = await tx.execute<{ updated_at: Date }>(sql`
        select updated_at
          from public.product_surveys
         where user_id = app.current_user_id()
         order by updated_at desc
         limit 1
      `);
      const lastInteractionAt = result.rows[0]?.updated_at ?? null;
      return { due: isSurveyDue(lastInteractionAt), lastInteractionAt };
    });
  } catch {
    // The survey migration is intentionally additive. Until it is applied to
    // a deployed database, the dashboard must remain usable and simply omit
    // the optional prompt.
    return { due: false, lastInteractionAt: null };
  }
}

export async function recordSurveyInteraction(
  workspace: Workspace,
  input: {
    status: "submitted" | "dismissed" | "remind";
    featureUsed?: string | null;
    challenge?: string | null;
    bugReport?: string | null;
    requestedFeature?: string | null;
    satisfaction?: number | null;
    wouldRecommend?: boolean | null;
  },
): Promise<void> {
  await inWorkspace(workspace, async (tx) => {
    await tx.execute(sql`
      insert into public.product_surveys
        (org_id, user_id, period_start, status, feature_used, challenge, bug_report,
         requested_feature, satisfaction, would_recommend)
      values (
        ${workspace.org.orgId}::uuid, app.current_user_id(), ${periodStart()}, ${input.status},
        ${input.featureUsed ?? null}, ${input.challenge ?? null}, ${input.bugReport ?? null},
        ${input.requestedFeature ?? null}, ${input.satisfaction ?? null}, ${input.wouldRecommend ?? null}
      )
      on conflict (org_id, user_id, period_start)
      do update set status = excluded.status,
        feature_used = excluded.feature_used,
        challenge = excluded.challenge,
        bug_report = excluded.bug_report,
        requested_feature = excluded.requested_feature,
        satisfaction = excluded.satisfaction,
        would_recommend = excluded.would_recommend,
        updated_at = now()
    `);
  });
}
