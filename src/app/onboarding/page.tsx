import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvitationAction, createWorkspaceAction } from "@/app/onboarding/actions";
import { WorkspaceTypeFields } from "@/app/onboarding/WorkspaceTypeFields";
import { Button, LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Surfaces";
import { authMode, getCurrentUser, getUserOrganizations, hasClerkSessionHint } from "@/lib/auth";
import { pendingInvitationsForEmail } from "@/lib/data";
import { PLAN_ORDER, PLANS, parseSelectablePlanKey, type SelectablePlanKey } from "@/lib/plans";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string; plan?: string }>;
}) {
  const { error, step: rawStep, plan: rawPlan } = await searchParams;
  const step = rawStep === "workspace" ? "workspace" : rawStep === "billing" ? "billing" : "plan";
  const plan: SelectablePlanKey = parseSelectablePlanKey(rawPlan);
  const user = await getCurrentUser();
  if (!user) {
    const next = `/onboarding?step=${step}${plan !== "free" ? `&plan=${plan}` : ""}`;
    if (authMode() === "clerk" && await hasClerkSessionHint()) {
      redirect(`/auth/complete?next=${encodeURIComponent(next)}`);
    }
    redirect("/login");
  }
  if (!user.profileComplete) {
    const next = `/onboarding?step=${step}${plan !== "free" ? `&plan=${plan}` : ""}`;
    redirect(`/profile-completion?next=${encodeURIComponent(next)}`);
  }
  const orgs = await getUserOrganizations(user);
  const invites = await pendingInvitationsForEmail(user.email);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-canvas)] px-6 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">Get started</p>
        <h1 className="mt-2 font-display text-[22px] font-semibold text-[var(--color-ink)]">
          {orgs.length > 0 ? "Create another workspace" : "Set up your workspace"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          {orgs.length > 0
            ? "You already belong to a workspace. Create another, join an invitation, or head back."
            : "Every contact, campaign, and report lives inside a workspace. Choose how you will use Workflow."}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Onboarding progress">
          {["Plan", "Workspace", "Details", "Dashboard"].map((label, index) => (
            <div key={label} className={(step === "plan" && index === 0) || (step === "workspace" && index > 0) ? "border-t-2 border-[var(--color-brand)] pt-2 text-[11px] font-semibold text-[var(--color-brand)]" : "border-t-2 border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-muted)]"}>
              {index + 1}. {label}
            </div>
          ))}
        </div>
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {invites.length > 0 && (
          <div className="mt-6 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">You have workspace invitation(s)</p>
            <div className="mt-2 space-y-2">
              {invites.map((inv) => (
                <form key={inv.token} action={acceptInvitationAction} className="flex items-center justify-between gap-3">
                  <input type="hidden" name="token" value={inv.token} />
                  <span className="min-w-0 truncate text-[13px] text-[var(--color-ink-soft)]">
                    {inv.orgName} <span className="text-[var(--color-muted)]">· {inv.role}</span>
                  </span>
                  <Button type="submit" size="sm" variant="outline">
                    Join
                  </Button>
                </form>
              ))}
            </div>
          </div>
        )}

        {step === "plan" && orgs.length === 0 && invites.length === 0 && (
          <div className="mt-6 space-y-4">
            <div><h2 className="font-display text-[17px] font-semibold text-[var(--color-ink)]">Choose your starting plan</h2><p className="mt-1 text-[12.5px] text-[var(--color-muted)]">Paid plans remain pending until billing is connected; active limits stay on Free.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLAN_ORDER.map((key) => {
                const item = PLANS[key];
                return <div key={key} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-4">
                  <p className="font-display text-[16px] font-semibold text-[var(--color-ink)]">{item.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-muted)]">${item.priceMonthly}/month</p>
                  <LinkButton href={`/onboarding?step=workspace&plan=${key}`} size="sm" variant={key === plan ? "primary" : "outline"} className="mt-4 w-full">Choose {item.name}</LinkButton>
                </div>;
              })}
            </div>
          </div>
        )}
        {step !== "billing" && (step === "workspace" || orgs.length > 0 || invites.length > 0) && (
        <form action={createWorkspaceAction} className="mt-6 space-y-4">
          <input type="hidden" name="step" value={step} />
          <input type="hidden" name="plan" value={plan} />
          <WorkspaceTypeFields />
          <Button type="submit" className="w-full" size="lg">Continue with workspace setup</Button>
        </form>
        )}

        {step === "billing" && (
          <div className="mt-6 space-y-4">
            <Alert tone="warning" title={`${PLANS[plan].name} selected — billing setup required`}>
              No billing provider is connected in this development milestone. The workspace is safe, but the active entitlement remains Free until payment is confirmed.
            </Alert>
            <p className="text-[13px] leading-relaxed text-[var(--color-ink-soft)]">The paid selection is retained as a pending intent only; it does not unlock paid limits.</p>
            <LinkButton href="/dashboard" className="w-full">Continue to dashboard</LinkButton>
          </div>
        )}
        {orgs.length > 0 && (
          <p className="mt-4 text-center text-[13px]">
            <Link href="/dashboard" className="font-medium text-[var(--color-brand)]">
              ← Back to dashboard
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
