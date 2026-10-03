import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { signupAction } from "@/app/(auth)/actions";
import { authMode } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mode = authMode();

  if (mode === "unconfigured") {
    return (
      <div>
        <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">
          Sign-up unavailable
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          This deployment has no identity provider configured, so account creation is disabled.
        </p>
        <div className="mt-5">
          <Alert tone="danger">
            Set <code className="font-mono text-[12px]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
            <code className="font-mono text-[12px]">CLERK_SECRET_KEY</code> to enable sign-up.
          </Alert>
        </div>
      </div>
    );
  }

  if (mode === "clerk") {
    return (
      <div>
        <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">
          Create your workspace
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          Free forever for small operations. No card required.
        </p>
        <div className="mt-7">
          <SignUp routing="hash" forceRedirectUrl="/dashboard" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">Create your workspace</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">Free forever for small operations. No card required.</p>

      {error && (
        <div className="mt-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <form action={signupAction} className="mt-7 space-y-4">
        <FieldGroup>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" placeholder="Grace Johnson" required autoComplete="name" />
        </FieldGroup>
        <FieldGroup>
          <Label htmlFor="organization">Organization name</Label>
          <Input id="organization" name="organization" placeholder="Grace Community Church" required />
        </FieldGroup>
        <FieldGroup>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" placeholder="you@organization.org" required autoComplete="email" />
        </FieldGroup>
        <FieldGroup>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
          <HelpText>
            Development bridge only — password sign-up is disabled in production. Configure Clerk to
            enable real account creation.
          </HelpText>
        </FieldGroup>
        <Button type="submit" className="w-full" size="lg">
          Create workspace
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-[var(--color-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--color-brand)]">
          Log in
        </Link>
      </p>
    </div>
  );
}
