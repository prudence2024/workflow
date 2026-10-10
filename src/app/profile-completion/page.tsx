import { redirect } from "next/navigation";
import { completeProfileAction } from "@/app/profile-completion/actions";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label, HelpText } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

function safeInternalNext(value: string | undefined): string {
  if (!value) return "/onboarding?step=workspace";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    // Fall through to onboarding.
  }
  return "/onboarding?step=workspace";
}

export default async function ProfileCompletionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { error, next: rawNext } = await searchParams;
  const next = safeInternalNext(rawNext);
  if (user.profileComplete) redirect(next);

  return (
    <AuthShell eyebrow="Profile">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">One last detail</p>
        <h1 className="mt-2 font-display text-[24px] font-semibold text-[var(--color-ink)]">Complete your profile</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          Workflow needs your first and last name before creating a workspace.
        </p>
        {error && <div className="mt-5"><Alert tone="danger">{error}</Alert></div>}
        <form action={completeProfileAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <FieldGroup>
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" defaultValue={user.firstName} autoComplete="given-name" required />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" defaultValue={user.lastName} autoComplete="family-name" required />
            <HelpText>Your name is used to name a personal workspace and identify workspace activity.</HelpText>
          </FieldGroup>
          <Button type="submit" className="w-full" size="lg">Continue</Button>
        </form>
      </div>
    </AuthShell>
  );
}
