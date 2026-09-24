import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { Section, SectionHeading, Eyebrow } from "@/components/marketing/Section";
import { PipelineDemo } from "@/components/marketing/PipelineDemo";
import { StatusPill } from "@/components/ui/Status";

const AUDIENCES = ["Event organizers", "Schools", "Churches", "NGOs", "Agencies", "HR teams"];

const WORKFLOW = [
  {
    step: "01",
    title: "Import & validate",
    body: "Upload XLSX or CSV. See total rows, valid rows, duplicates, and warnings before anything happens.",
  },
  {
    step: "02",
    title: "Map & submit",
    body: "Map spreadsheet columns to form fields with confidence scoring, then run submissions safely through queued workers.",
  },
  {
    step: "03",
    title: "Track & follow up",
    body: "Every person becomes a persistent contact record with a timeline, communications, and next actions.",
  },
];

const USE_CASES = [
  { title: "Event registration", body: "Bulk-register attendees, send confirmations, and track check-ins." },
  { title: "School enrollment", body: "Process applications with custom fields like Student ID and Department." },
  { title: "Membership & church records", body: "Track membership numbers, campaign history, and giving-adjacent notes." },
  { title: "Employee onboarding", body: "Coordinate document collection and status across a hiring cohort." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--color-border)] bg-[radial-gradient(circle_at_15%_0%,rgba(42,58,143,0.08),transparent_45%)]">
        <div className="mx-auto grid max-w-[1240px] gap-14 px-6 pb-16 pt-16 md:pt-24 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="animate-fade-up">
            <Eyebrow>Form operations platform</Eyebrow>
            <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-[1.06] text-[var(--color-ink)]">
              Turn spreadsheets into completed workflows.
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--color-muted)]">
              Upload your data, connect an authorized form, map fields, validate records, automate submissions,
              track every person, and manage follow-up — from one workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/signup" size="lg">
                Start free
              </LinkButton>
              <LinkButton href="/how-it-works" variant="outline" size="lg">
                See how it works
              </LinkButton>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-[var(--color-muted)]">
              <span className="font-semibold text-[var(--color-ink-soft)]">Built for</span>
              {AUDIENCES.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]">
            <PipelineDemo />
          </div>
        </div>
      </section>

      <Section className="pt-16 md:pt-20">
        <SectionHeading
          eyebrow="The problem"
          title="Spreadsheets don't remember anything."
          description="A row in a spreadsheet has no history, no status, and no memory of what happened last time. Once you're managing hundreds of registrations across multiple campaigns, spreadsheets stop being a system of record — they become a liability."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { label: "No history", body: "You can't tell if Grace already registered for last year's conference." },
            { label: "No status", body: "Nobody knows which submissions failed, which need review, or which are stuck." },
            { label: "No accountability", body: "Reminders, receipts, and follow-ups live in someone's inbox, not a system." },
          ].map((item) => (
            <div key={item.label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
              <p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">{item.label}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-t border-[var(--color-border)] bg-white">
        <SectionHeading eyebrow="The workflow" title="Import → Map → Validate → Submit → Track → Report" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {WORKFLOW.map((item) => (
            <div key={item.step} className="relative rounded-[var(--radius-md)] border border-[var(--color-border)] p-6">
              <span className="font-mono-data text-[13px] font-semibold text-[var(--color-brand)]">{item.step}</span>
              <p className="mt-3 font-display text-[16px] font-semibold text-[var(--color-ink)]">{item.title}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Contact records"
              title="Every person becomes a persistent record."
              description="Not a spreadsheet row. A contact with campaign history, communications, documents, and a full timeline you can actually rely on."
            />
            <ul className="mt-6 space-y-3 text-[13.5px] text-[var(--color-ink-soft)]">
              {["Campaign history across every registration", "Every email and reminder logged automatically", "Notes, tags, and next actions your team can trust"].map(
                (t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
              <div>
                <p className="font-display text-[15px] font-semibold">Grace Johnson</p>
                <p className="text-[12px] text-[var(--color-muted)]">grace.j@mail.com · +234 801 234 5678</p>
              </div>
              <StatusPill status="active" />
            </div>
            <div className="mt-4 space-y-4">
              {[
                { time: "09:42", label: "Imported from Q1 Registrations.xlsx" },
                { time: "09:43", label: "Validation passed" },
                { time: "09:46", label: "Form submitted to Youth Conference 2026" },
                { time: "09:47", label: "Confirmation email sent" },
                { time: "09:48", label: "Email delivered" },
              ].map((event, i, arr) => (
                <div key={event.time} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />
                    {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--color-border)]" />}
                  </div>
                  <div className="pb-4">
                    <p className="font-mono-data text-[11px] text-[var(--color-muted)]">{event.time}</p>
                    <p className="text-[13px] text-[var(--color-ink)]">{event.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section className="border-t border-[var(--color-border)] bg-white">
        <SectionHeading
          eyebrow="Use cases"
          title="One workflow engine, many operations."
          description="Whatever the process, the underlying operating model is the same: people, forms, and follow-up."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((u) => (
            <div key={u.title} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-5">
              <p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">{u.title}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{u.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-ink)] px-8 py-14 text-center sm:px-16">
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-semibold text-white">
            Stop managing operations in spreadsheets.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14.5px] text-white/70">
            Start free, import your first list, and see the full lifecycle from registration to reporting in minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/signup" size="lg">
              Start free
            </LinkButton>
            <Link
              href="/security"
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-md)] border border-white/20 px-6 text-[15px] font-medium text-white hover:bg-white/10"
            >
              Read our security model
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
