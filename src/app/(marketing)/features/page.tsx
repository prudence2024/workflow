import { Section, SectionHeading } from "@/components/marketing/Section";

const GROUPS = [
  {
    title: "Contacts & data",
    items: [
      "Manual creation & bulk import (XLSX/CSV)",
      "Custom fields without schema changes",
      "Tags, notes, and assigned team members",
      "Server-side pagination for large datasets",
      "Archive & restore, never destructive delete",
    ],
  },
  {
    title: "Imports & validation",
    items: [
      "Upload → Inspect → Map → Validate → Preview → Import",
      "Duplicate detection by email, phone, or custom identifiers",
      "Row-level error reporting before import",
      "Original files retained for audit",
    ],
  },
  {
    title: "Campaigns & submission",
    items: [
      "Draft, Ready, Running, Paused, Completed, Archived states",
      "Queued asynchronous processing — never blocks the UI",
      "Retry with backoff, dead-letter for exhausted retries",
      "Human Action Required whenever verification is detected",
    ],
  },
  {
    title: "Communication & reporting",
    items: [
      "Personalized email templates with variables",
      "Delivery state tracking per message",
      "Campaign reports with success/failure breakdown",
      "CSV/XLSX export for every dataset",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <Section className="pt-16">
      <SectionHeading eyebrow="Features" title="Everything you need to operate at scale." />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="font-display text-[15px] font-semibold text-[var(--color-ink)]">{g.title}</p>
            <ul className="mt-4 space-y-2.5">
              {g.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[13.5px] text-[var(--color-ink-soft)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
