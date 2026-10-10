"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideSessionCompletion,
  SESSION_COMPLETION_INTERVAL_MS,
  SESSION_COMPLETION_REQUEST_TIMEOUT_MS,
  type SessionStatus,
} from "@/lib/sessionCompletion";

type Phase = "checking" | "recovery";

export function SessionCompletion({ next }: { next: string }) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [retryKey, setRetryKey] = useState(0);
  const attempts = useRef(0);
  const completed = useRef(false);
  const timer = useRef<number | null>(null);
  const runVersion = useRef(0);
  const checkRef = useRef<() => Promise<void>>(async () => {});

  const check = useCallback(async () => {
    if (!isLoaded || completed.current) return;
    const version = runVersion.current;

    attempts.current += 1;
    let server: SessionStatus = { authenticated: false, userReady: false };
    try {
      const response = await fetch("/api/auth/session-status", {
        cache: "no-store",
        signal: AbortSignal.timeout(SESSION_COMPLETION_REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as Partial<SessionStatus>;
      server = {
        authenticated: body.authenticated === true,
        userReady: body.userReady === true,
        destination: typeof body.destination === "string" ? body.destination : undefined,
      };
    } catch {
      // Keep the browser in the bounded readiness window. The server remains
      // the only authority; this client state is never used for authorization.
    }

    if (version !== runVersion.current || completed.current) return;

    const decision = decideSessionCompletion({
      server,
      clientSignedIn: isSignedIn === true,
      attempts: attempts.current,
    });

    if (decision === "ready") {
      completed.current = true;
      window.location.replace(server.destination ?? next);
      return;
    }
    if (decision === "signed_out") {
      completed.current = true;
      window.location.replace("/login");
      return;
    }
    if (decision === "recovery") {
      setPhase("recovery");
      return;
    }

    timer.current = window.setTimeout(() => void checkRef.current(), SESSION_COMPLETION_INTERVAL_MS);
  }, [isLoaded, isSignedIn, next]);

  useEffect(() => {
    checkRef.current = check;
    runVersion.current += 1;
    attempts.current = 0;
    completed.current = false;
    void check();
    return () => {
      checkRef.current = async () => {};
      runVersion.current += 1;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [check, retryKey]);

  async function signOutAndRestart() {
    completed.current = true;
    await signOut();
    window.location.replace("/login");
  }

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-md items-center justify-center px-6 py-12">
      <div className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-md)]">
        {phase === "checking" ? (
          <>
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-brand)]" aria-hidden="true" />
            <h1 className="mt-5 font-display text-[22px] font-semibold text-[var(--color-ink)]">Finishing your account setup…</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">
              We are confirming your secure Workflow session. This usually takes only a moment.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">We couldn&apos;t finish establishing your session.</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">
              The identity provider is signed in, but the server has not confirmed the session yet.
            </p>
            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase("checking");
                  setRetryKey((value) => value + 1);
                }}
                className="h-11 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 text-sm font-medium text-white hover:bg-[var(--color-brand-strong)]"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => void signOutAndRestart()}
                className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-ink)] hover:border-[var(--color-brand)]"
              >
                Sign out and sign in again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
