import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Development-only destination used by the form-worker smoke test. It is
 * deliberately separate from the customer contact placeholder and is not
 * available when the app is configured for production.
 */
export default function TestingFormPage() {
  if (process.env.NEON_BRANCH !== "development") notFound();

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">Workflow testing target</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--color-ink)]">Automation smoke test</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">This controlled form is available only on the development testing deployment.</p>
        <form method="post" action="/api/testing/form-submit" className="mt-6 space-y-4">
          <div role="listitem" className="space-y-2">
            <label htmlFor="first_name" className="text-sm font-medium text-[var(--color-ink)]">First name</label>
            <input id="first_name" name="first_name" type="text" required className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm" />
          </div>
          <div role="listitem" className="space-y-2">
            <label htmlFor="last_name" className="text-sm font-medium text-[var(--color-ink)]">Last name</label>
            <input id="last_name" name="last_name" type="text" required className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm" />
          </div>
          <div role="listitem" className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-[var(--color-ink)]">Email</label>
            <input id="email" name="email" type="email" required className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm" />
          </div>
          <div role="listitem" className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium text-[var(--color-ink)]">Message</label>
            <textarea id="message" name="message" required className="min-h-24 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white">Submit</button>
        </form>
      </div>
    </main>
  );
}
