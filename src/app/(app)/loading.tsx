export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading workspace" className="mx-auto w-full max-w-6xl space-y-6">
      <span className="sr-only">Loading your workspace…</span>
      <div className="h-8 w-56 animate-pulse rounded-md bg-[var(--color-border)]/70" />
      <div className="grid gap-4 md:grid-cols-3">
        {["one", "two", "three"].map((item) => <div key={item} className="h-28 animate-pulse rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]" />)}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]" />
    </div>
  );
}
