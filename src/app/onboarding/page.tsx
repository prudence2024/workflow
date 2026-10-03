import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvitationAction, createWorkspaceAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label, HelpText } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { pendingInvitationsForEmail } from "@/lib/data";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const orgs = await getUserOrganizations(user);
  const invites = await pendingInvitationsForEmail(user.email);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-canvas)] px-6 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-8 shadow-[var(--shadow-md)]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">Get started</p>
        <h1 className="mt-2 font-display text-[22px] font-semibold text-[var(--color-ink)]">
          {orgs.length > 0 ? "Create another workspace" : "Set up your workspace"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          {orgs.length > 0
            ? "You already belong to a workspace. Create another, join an invitation, or head back."
            : "Every contact, campaign, and report lives inside a workspace. Choose how you will use Workflow."}
        </p>
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

        <form action={createWorkspaceAction} className="mt-6 space-y-4">
          <FieldGroup>
            <Label>How will you use Workflow?</Label>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] p-3 has-checked:border-[var(--color-brand)]">
                <input type="radio" name="accountType" value="personal" defaultChecked className="mt-1" />
                <span>
                  <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For myself</span>
                  <span className="block text-[12.5px] text-[var(--color-muted)]">
                    A personal workspace — still a real tenant, convertible to a team later.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] p-3 has-checked:border-[var(--color-brand)]">
                <input type="radio" name="accountType" value="organization" className="mt-1" />
                <span>
                  <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For an organization</span>
                  <span className="block text-[12.5px] text-[var(--color-muted)]">
                    A team workspace you own — invite teammates after setup.
                  </span>
                </span>
              </label>
            </div>
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" name="name" placeholder="Grace Community Church" />
            <HelpText>Only needed for an organization. Personal workspaces are named for you automatically.</HelpText>
          </FieldGroup>
          <Button type="submit" className="w-full" size="lg">
            Create workspace
          </Button>
        </form>

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
