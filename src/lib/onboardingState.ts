import "server-only";
import { sql } from "drizzle-orm";
import { withUserSession, type Identity } from "@/lib/tenant";
import type { SelectablePlanKey } from "@/lib/plans";

export type OnboardingStage = "auth_complete" | "workspace" | "details" | "plan" | "payment" | "complete";
export type OnboardingWorkspaceType = "personal" | "organization";

export async function getOnboardingState(identity: Identity) {
  return withUserSession(identity, async (tx) => {
    const result = await tx.execute<{
      stage: OnboardingStage;
      plan: SelectablePlanKey | null;
      workspace_type: OnboardingWorkspaceType | null;
      workspace_name: string | null;
      workspace_id: string | null;
      phone: string | null;
      phone_verified_at: Date | null;
    }>(sql`
      select onboarding_stage as stage,
             onboarding_plan as plan,
             onboarding_workspace_type as workspace_type,
             onboarding_workspace_name as workspace_name,
             onboarding_workspace_id as workspace_id,
             onboarding_phone as phone,
             onboarding_phone_verified_at as phone_verified_at
      from public.users
      where id = app.current_user_id()
      limit 1
    `);
    const row = result.rows[0];
    return row
      ? { stage: row.stage, plan: row.plan, workspaceType: row.workspace_type, workspaceName: row.workspace_name, workspaceId: row.workspace_id, phone: row.phone, phoneVerifiedAt: row.phone_verified_at }
      : { stage: "workspace" as const, plan: null, workspaceType: null, workspaceName: null, workspaceId: null, phone: null, phoneVerifiedAt: null };
  });
}

export async function setOnboardingState(
  identity: Identity,
  values: {
    stage?: OnboardingStage;
    plan?: SelectablePlanKey | null;
    workspaceType?: OnboardingWorkspaceType | null;
    workspaceName?: string | null;
    workspaceId?: string | null;
    phone?: string | null;
    phoneVerifiedAt?: Date | null;
  },
) {
  await withUserSession(identity, async (tx) => {
    await tx.execute(sql`
      update public.users
      set onboarding_stage = case when ${values.stage === undefined} then onboarding_stage else ${values.stage ?? null} end,
          onboarding_plan = case when ${values.plan === undefined} then onboarding_plan else ${values.plan ?? null} end,
          onboarding_workspace_type = case when ${values.workspaceType === undefined} then onboarding_workspace_type else ${values.workspaceType ?? null} end,
          onboarding_workspace_name = case when ${values.workspaceName === undefined} then onboarding_workspace_name else ${values.workspaceName ?? null} end,
          onboarding_workspace_id = case when ${values.workspaceId === undefined} then onboarding_workspace_id else ${values.workspaceId ?? null}::uuid end,
          onboarding_phone = case when ${values.phone === undefined} then onboarding_phone else ${values.phone ?? null} end,
          onboarding_phone_verified_at = case when ${values.phoneVerifiedAt === undefined} then onboarding_phone_verified_at else ${values.phoneVerifiedAt ?? null} end
      where id = app.current_user_id()
    `);
  });
}
