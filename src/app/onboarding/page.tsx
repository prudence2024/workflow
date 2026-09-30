import { redirect } from "next/navigation";
import { createOrganizationAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";
import { getCurrentUser } from "@/lib/auth";

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

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-8 shadow-[var(--shadow-md)]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">Get started</p>
        <h1 className="mt-2 font-display text-[22px] font-semibold text-[var(--color-ink)]">Create a workspace</h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          Every contact, campaign, and report lives inside a workspace scoped to your organization.
        </p>
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <form action={createOrganizationAction} className="mt-6 space-y-4">
          <FieldGroup>
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" name="name" placeholder="Grace Community Church" required />
          </FieldGroup>
          <Button type="submit" className="w-full" size="lg">
            Create workspace
          </Button>
        </form>
      </div>
    </div>
  );
}
