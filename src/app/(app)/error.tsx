"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[40vh] w-full max-w-lg flex-col items-center justify-center text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Workspace unavailable</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">We couldn’t load this workspace</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Your data is safe. Retry the request or return to the dashboard.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        <a href="/dashboard" className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">Go to dashboard</a>
      </div>
    </div>
  );
}
