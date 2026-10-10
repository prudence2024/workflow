import Link from "next/link";
import { redirect } from "next/navigation";
import { completeDetailsAction, selectPlanAction, selectWorkspaceAction } from "@/app/onboarding/server-actions";
import { acceptInvitationAction } from "@/app/(app)/settings/actions";
import { OnboardingDraftCleanup, DetailsDraftFields, WorkspaceDraftFields } from "@/app/onboarding/OnboardingDraftFields";
import { OnboardingStepper } from "@/app/onboarding/OnboardingStepper";
import { AuthShell } from "@/components/auth/AuthShell";
import { PlanCard } from "@/components/pricing/PlanCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Surfaces";
import { authMode, getCurrentUser, getUserOrganizations, hasClerkSessionHint, identityOf } from "@/lib/auth";
import { pendingInvitationsForEmail } from "@/lib/data";
import { getOnboardingState } from "@/lib/onboardingState";
import { PLANS, parseSelectablePlanKey, type SelectablePlanKey } from "@/lib/plans";
import { resolveOnboardingStep } from "@/lib/onboardingNavigation";
import { safeErrorDiagnostic } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
type Step = "workspace" | "details" | "plan" | "billing";

function OnboardingRecovery({ correlationId }: { correlationId: string }) {
  return (
    <AuthShell eyebrow="Workspace setup">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <Alert tone="danger" title="We couldn't resume setup">Your saved setup is still safe. Try again to continue from the last available step.</Alert>
        <Link href="/onboarding" className="mt-5 block rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-3 text-center text-sm font-semibold text-white">Try again</Link>
        <p className="mt-3 text-center text-[11px] text-[var(--color-muted)]">Reference: {correlationId}</p>
      </div>
    </AuthShell>
  );
}

function logRouteFailure(correlationId: string, stage: string, error: unknown) {
  console.error("[onboarding] route initialization failed", {
    correlationId,
    route: "/onboarding",
    stage,
    operation: "onboarding_route_initialization",
    error: safeErrorDiagnostic(error),
  });
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; step?: string; plan?: string; status?: string; draft?: string }> }) {
  const correlationId = crypto.randomUUID();
  const { error, step: rawStep, plan: rawPlan, draft } = await searchParams;
  const requested = rawStep as Step | undefined;
  const requestedStep: Step = ["workspace", "details", "plan", "billing"].includes(requested ?? "") ? requested! : "workspace";
  let user;
  try {
    user = await getCurrentUser();
  } catch (failure) {
    logRouteFailure(correlationId, "session_resolution", failure);
    return <OnboardingRecovery correlationId={correlationId} />;
  }
  if (!user) {
    const next = `/onboarding?step=${requestedStep}`;
    if (authMode() === "clerk" && await hasClerkSessionHint()) redirect(`/auth/complete?next=${encodeURIComponent(next)}`);
    redirect("/login");
  }
  // First/last name fields are intentionally collected by the Details step.
  // Do not send a newly authenticated, no-workspace user through the legacy
  // profile-completion route before they can enter onboarding.

  let state;
  try {
    state = await getOnboardingState(identityOf(user));
  } catch (failure) {
    logRouteFailure(correlationId, "onboarding_state_read", failure);
    return <OnboardingRecovery correlationId={correlationId} />;
  }
  let step;
  try {
    step = resolveOnboardingStep(rawStep, state);
  } catch (failure) {
    logRouteFailure(correlationId, "onboarding_step_resolution", failure);
    return <OnboardingRecovery correlationId={correlationId} />;
  }
  const plan: SelectablePlanKey = parseSelectablePlanKey(rawPlan ?? state.plan);
  let orgs;
  try {
    orgs = await getUserOrganizations(user);
  } catch (failure) {
    logRouteFailure(correlationId, "membership_lookup", failure);
    return <OnboardingRecovery correlationId={correlationId} />;
  }
  let invites;
  try {
    invites = await pendingInvitationsForEmail(user.email);
  } catch (failure) {
    logRouteFailure(correlationId, "invitation_lookup", failure);
    return <OnboardingRecovery correlationId={correlationId} />;
  }
  const workspaceType = state.workspaceType === "personal" || state.workspaceType === "organization" ? state.workspaceType : null;
  const detailsComplete = Boolean(state.phone) && Boolean(workspaceType);
  const planComplete = Boolean(state.plan);

  return (
    <AuthShell eyebrow="Workspace setup" contentClassName={step === "plan" ? "max-w-[1180px]" : undefined}>
      <OnboardingDraftCleanup step={draft === "saved" && step === "details" ? "workspace" : draft === "saved" && step === "plan" ? "details" : undefined} />
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">Get started</p>
        <h1 className="mt-2 font-display text-[22px] font-semibold text-[var(--color-ink)]">{orgs.length > 0 ? "Create another workspace" : "Set up your workspace"}</h1>
        <p className="mt-1.5 text-[13px] text-[var(--color-muted)]">A calm, guided setup. Your workspace is not created until your details are complete.</p>
        <OnboardingStepper step={step} completedSteps={{ workspace: Boolean(workspaceType), details: detailsComplete, plan: planComplete }} />
        {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}

        {invites.length > 0 && <div className="mt-6 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4"><p className="text-[13px] font-semibold text-[var(--color-ink)]">You have workspace invitation(s)</p><div className="mt-2 space-y-2">{invites.map((inv) => <form key={inv.token} action={acceptInvitationAction} className="flex items-center justify-between gap-3"><input type="hidden" name="token" value={inv.token} /><span className="truncate text-[13px] text-[var(--color-ink-soft)]">{inv.orgName} · {inv.role}</span><Button type="submit" size="sm" variant="outline">Join</Button></form>)}</div></div>}

        {step === "plan" && orgs.length === 0 && invites.length === 0 && <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{(["free", "pro", "plus"] as const).map((key) => <form key={key} action={selectPlanAction} className="min-w-0"><input type="hidden" name="plan" value={key} /><PlanCard planKey={key} action={<Button type="submit" size="sm" variant={key === "pro" ? "secondary" : "outline"} className="w-full">{key === "free" ? "Start with Free" : `Continue with ${PLANS[key].name}`}</Button>} /></form>)}</div>}

        {step === "workspace" && <form action={selectWorkspaceAction} className="mt-6 space-y-4"><WorkspaceDraftFields initialType={workspaceType} /><Button type="submit" className="w-full" size="lg">Continue to details</Button></form>}

        {step === "details" && <form action={completeDetailsAction} className="mt-6 space-y-4"><input type="hidden" name="accountType" value={workspaceType ?? "personal"} /><DetailsDraftFields initialFirstName={user.firstName} initialLastName={user.lastName} initialPhone={state.phone} initialWorkspaceName={state.workspaceName} organization={workspaceType === "organization"} /><Button type="submit" className="w-full" size="lg">Continue to plan</Button></form>}

        {step === "billing" && <div className="mt-6 space-y-4"><Alert tone="warning" title={`${PLANS[plan].name} selected — checkout unavailable`}>Paid checkout is temporarily unavailable. Your workspace remains on Free until verified billing. No paid entitlement has been activated.</Alert><Link href="/onboarding?step=plan" className="block rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-3 text-center text-sm font-medium text-[var(--color-ink)]">Review plan</Link></div>}
        {orgs.length > 0 && <p className="mt-4 text-center text-[13px]"><Link href="/dashboard" className="font-medium text-[var(--color-brand)]">← Back to dashboard</Link></p>}
      </div>
    </AuthShell>
  );
}
