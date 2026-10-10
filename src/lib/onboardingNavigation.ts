export type OnboardingStep = "workspace" | "details" | "plan" | "billing";

/** Resume from persisted progress, while allowing safe backwards navigation. */
export function resolveOnboardingStep(requested: unknown, state: {
  stage: string | null;
  plan: string | null;
  workspaceType: string | null;
  workspaceId: string | null;
  phone?: string | null;
}): OnboardingStep {
  const hasWorkspaceType = state.workspaceType === "personal" || state.workspaceType === "organization";
  const hasDetails = Boolean(state.phone) && hasWorkspaceType;
  const canBill = Boolean(state.workspaceId) && (state.plan === "pro" || state.plan === "plus");
  if (requested === "workspace") return "workspace";
  if (requested === "details" && hasWorkspaceType) return "details";
  if (requested === "plan" && hasDetails) return "plan";
  if (requested === "billing" && canBill) return "billing";
  if (state.stage === "payment" && canBill) return "billing";
  if (state.stage === "plan" && hasDetails) return "plan";
  if (state.stage === "details" && hasDetails) return "plan";
  if (state.stage === "details" && hasWorkspaceType) return "details";
  return "workspace";
}
