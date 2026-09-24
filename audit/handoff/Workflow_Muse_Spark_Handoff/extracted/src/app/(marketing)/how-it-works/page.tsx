import { Section, SectionHeading } from "@/components/marketing/Section";

const STEPS = [
  { title: "Import", body: "Upload an XLSX or CSV file. We inspect columns, detect types, and count rows." },
  { title: "Map", body: "Match spreadsheet columns to form fields — manually, with intelligent suggestions." },
  { title: "Validate", body: "Every row is checked for required fields, format, and duplicates before anything runs." },
  { title: "Submit", body: "Campaigns run asynchronously through a queue. Nothing processes synchronously in your browser." },
  { title: "Track", body: "Each record gets a live status: queued, processing, successful, failed, or needs attention." },
  { title: "Communicate", body: "Confirmation emails send automatically and log to each contact's timeline." },
  { title: "Report", body: "Export CSV/XLSX reports with success rate and categorized failures." },
];

export default function HowItWorksPage() {
  return (
    <Section className="pt-16">
      <SectionHeading
        eyebrow="How it works"
        title="Import → Map → Validate → Submit → Track → Communicate → Report"
        description="A disciplined pipeline that keeps every record accountable from the moment it enters your workspace."
      />
      <div className="mt-12 space-y-0">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-6 border-b border-[var(--color-border)] py-6 last:border-0">
            <div className="flex flex-col items-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] font-mono-data text-[13px] font-semibold text-[var(--color-brand)]">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && <span className="mt-2 w-px flex-1 bg-[var(--color-border)]" />}
            </div>
            <div className="pb-2">
              <p className="font-display text-[16px] font-semibold text-[var(--color-ink)]">{step.title}</p>
              <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[var(--color-muted)]">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
