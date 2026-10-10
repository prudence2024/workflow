"use client";

import { useClerk, useSignUp } from "@clerk/nextjs";
import { FormEvent, useMemo, useState } from "react";

type SignupStep = "email" | "password" | "verification";

function clerkError(error: unknown): string {
  const value = error as { errors?: Array<{ longMessage?: string; message?: string }> };
  return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || "We couldn't continue signup. Please try again.";
}

export function AuthOnlySignup({ nextPath }: { nextPath: string }) {
  const { signUp, isLoaded } = useSignUp();
  const { setActive } = useClerk();
  const [step, setStep] = useState<SignupStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeUrl = useMemo(
    () => `/auth/complete?next=${encodeURIComponent(nextPath)}`,
    [nextPath],
  );
  const configuredProviders = useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_CLERK_SOCIAL_PROVIDERS?.split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean);
    return configured?.length ? configured : ["google"];
  }, []);

  async function activateIfComplete() {
    if (!signUp?.createdSessionId) return false;
    await setActive({ session: signUp.createdSessionId });
    window.location.assign(completeUrl);
    return true;
  }

  async function prepareEmailVerification() {
    if (!signUp) throw new Error("Signup is not ready");
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setStep("verification");
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signUp || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        legalAccepted: termsAccepted,
      });
      if (await activateIfComplete()) return;
      if (result.missingFields?.some((field) => field === "password")) {
        setStep("password");
      } else {
        await prepareEmailVerification();
      }
    } catch (signupError) {
      setError(clerkError(signupError));
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signUp || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.update({ password });
      if (await activateIfComplete()) return;
      await prepareEmailVerification();
    } catch (signupError) {
      setError(clerkError(signupError));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signUp || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (!(await activateIfComplete())) {
        setError("Your email was verified, but signup still needs one more authentication step.");
      }
    } catch (verificationError) {
      setError(clerkError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  async function continueWith(provider: string) {
    if (!isLoaded || !signUp || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy: `oauth_${provider}` as "oauth_google" | "oauth_facebook" | "oauth_github",
        redirectUrl: completeUrl,
        redirectUrlComplete: completeUrl,
        continueSignUp: true,
      });
    } catch (oauthError) {
      setError(clerkError(oauthError));
      setBusy(false);
    }
  }

  const providerLabels: Record<string, string> = {
    google: "Continue with Google",
    facebook: "Continue with Facebook",
    github: "Continue with GitHub",
  };

  return (
    <div className="space-y-5" data-testid="clerk-auth-only-signup">
      <div className="space-y-2">
        {configuredProviders.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={busy}
            onClick={() => void continueWith(provider)}
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {providerLabels[provider] ?? `Continue with ${provider}`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      {error && <p className="rounded-[var(--radius-sm)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]" role="alert">{error}</p>}

      {step === "email" && (
        <form onSubmit={submitEmail} className="space-y-4">
          <label className="block text-sm font-medium text-[var(--color-ink)]" htmlFor="signup-email">Email address</label>
          <input id="signup-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="you@organization.org" className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)]" />
          <label className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required className="mt-0.5" />
            <span>I agree to the Workflow <a className="text-[var(--color-brand)] underline" href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a className="text-[var(--color-brand)] underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
          </label>
          <button type="submit" disabled={busy || !isLoaded} className="w-full rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Continuing…" : "Continue"}</button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={submitPassword} className="space-y-4">
          <label className="block text-sm font-medium text-[var(--color-ink)]" htmlFor="signup-password">Create a password</label>
          <input id="signup-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)]" />
          <button type="submit" disabled={busy} className="w-full rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Continuing…" : "Continue"}</button>
        </form>
      )}

      {step === "verification" && (
        <form onSubmit={submitCode} className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">Enter the verification code sent to <span className="font-medium text-[var(--color-ink)]">{email}</span>.</p>
          <label className="block text-sm font-medium text-[var(--color-ink)]" htmlFor="signup-code">Verification code</label>
          <input id="signup-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-3 text-sm tracking-[0.25em] text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)]" />
          <button type="submit" disabled={busy} className="w-full rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Verifying…" : "Verify email"}</button>
        </form>
      )}
    </div>
  );
}
