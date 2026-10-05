import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { loginAction } from "@/app/(auth)/actions";
import { authMode } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mode = authMode();

  // Production without Clerk keys: do not render a credential form at all.
  if (mode === "unconfigured") {
    return (
      <div>
        <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">
          Sign-in unavailable
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          This deployment has no identity provider configured, so it refuses all sessions rather
          than falling back to password authentication.
        </p>
        <div className="mt-5">
          <Alert tone="danger">
            Set <code className="font-mono text-[12px]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
            <code className="font-mono text-[12px]">CLERK_SECRET_KEY</code> to enable sign-in.
          </Alert>
        </div>
      </div>
    );
  }

  if (mode === "clerk") {
    return (
      <div>
        <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">
          Log in to your Workflow workspace.
        </p>
        <div className="mt-7">
          {/* routing="hash" renders the flow inline so /login keeps hosting it. */}
          <SignIn
            routing="hash"
            forceRedirectUrl={`/auth/complete?next=${encodeURIComponent("/dashboard")}`}
          />
        </div>
      </div>
    );
  }

  // mode === "legacy": transitional bridge, development only.
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">Welcome back</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">Log in to your Workflow workspace.</p>

      {error && (
        <div className="mt-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <form action={loginAction} className="mt-7 space-y-4">
        <FieldGroup>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@organization.org" required autoComplete="email" />
        </FieldGroup>
        <FieldGroup>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
          <HelpText>
            Development bridge only — password sign-in is disabled in production. Configure Clerk to
            enable real authentication.
          </HelpText>
        </FieldGroup>
        <Button type="submit" className="w-full" size="lg">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-[var(--color-muted)]">
        Don&apos;t have a workspace?{" "}
        <Link href="/signup" className="font-medium text-[var(--color-brand)]">
          Start free
        </Link>
      </p>
    </div>
  );
}
