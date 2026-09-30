import { Section, SectionHeading } from "@/components/marketing/Section";
import { StatusPill } from "@/components/ui/Status";
import { LinkButton } from "@/components/ui/Button";

const MODULES = [
  {
    title: "Contacts",
    body: "A persistent record for every person — contact details, custom fields, tags, notes, and full timeline.",
  },
  {
    title: "Imports",
    body: "Upload → Inspect → Map → Validate → Preview → Import. Never silently import malformed data.",
  },
  {
    title: "Campaigns",
    body: "Group work by event, cohort, or process. Track queued, processing, successful, failed, and skipped in real time.",
  },
  {
    title: "Form analysis",
    body: "Point to an authorized external form URL and generate a reusable Form Definition automatically.",
  },
  {
    title: "Submission engine",
    body: "Asynchronous, queued, retryable. Human verification always stops automation and asks for human action.",
  },
  {
    title: "Communication",
    body: "Templated confirmation emails with personalization variables and delivery tracking.",
  },
  {
    title: "Reporting",
    body: "Success rates, failure categories, and CSV/XLSX exports for every campaign.",
  },
  {
    title: "Usage & plans",
    body: "Metering on contacts, submissions, imports, and emails from day one — the foundation for sustainable billing.",
  },
];

export default function ProductPage() {
  return (
    <>
      <Section className="pb-12 pt-16">
        <SectionHeading
          eyebrow="Product"
          title="One operating system for form-driven processes."
          description="Workflow replaces the spreadsheet-plus-five-tools approach with a single system that manages the complete lifecycle: import, validate, register, submit, track, communicate, remind, and report."
        />
        <div className="mt-8 flex gap-3">
          <LinkButton href="/signup">Start free</LinkButton>
          <LinkButton href="/how-it-works" variant="outline">
            See how it works
          </LinkButton>
        </div>
      </Section>

      <Section className="border-t border-[var(--color-border)] bg-white">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.title} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-5">
              <p className="font-display text-[14.5px] font-semibold text-[var(--color-ink)]">{m.title}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{m.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Statuses that mean something" title="Every operation is observable." />
        <div className="mt-8 flex flex-wrap gap-2.5">
          {["queued", "processing", "successful", "failed", "retrying", "skipped", "cancelled", "human_action_required"].map(
            (s) => (
              <StatusPill key={s} status={s} />
            ),
          )}
        </div>
        <p className="mt-6 max-w-2xl text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          Reliability is a product feature, not an implementation detail. Every operation carries a status, a
          timestamp, a result, retry state, and error information — so your team always knows what happened and why.
        </p>
      </Section>
    </>
  );
}
