import Link from "next/link";
import { loginAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Surfaces";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-[var(--color-ink)]">Welcome back</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-muted)]">Log in to your FormflowOps workspace.</p>

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
        </FieldGroup>
        <Button type="submit" className="w-full" size="lg">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-[var(--color-muted)]">
        Don't have a workspace?{" "}
        <Link href="/signup" className="font-medium text-[var(--color-brand)]">
          Start free
        </Link>
      </p>
    </div>
  );
}
