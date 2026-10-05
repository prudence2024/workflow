import { Section, SectionHeading } from "@/components/marketing/Section";

const CASES = [
  { title: "Event registration", audience: "Event organizers", body: "Register hundreds of attendees, send confirmations, and track who's checked in." },
  { title: "School enrollment", audience: "Schools", body: "Process applications with Student ID, Department, and custom eligibility fields." },
  { title: "Survey submission", audience: "Researchers & agencies", body: "Submit structured survey responses at scale with full validation." },
  { title: "Membership registration", audience: "Churches & associations", body: "Track membership numbers, campaign history, and communication per member." },
  { title: "Employee onboarding", audience: "HR teams", body: "Coordinate document collection and onboarding form submission for new hires." },
  { title: "Conference registration", audience: "Organizations", body: "Run multi-track registration with reminders and reporting." },
  { title: "Application processing", audience: "NGOs", body: "Process grant or program applications with duplicate detection." },
  { title: "Appointment registration", audience: "Clinics & services", body: "Register appointment requests and track completion status." },
];

export default function UseCasesPage() {
  return (
    <Section className="pt-16">
      <SectionHeading eyebrow="Use cases" title="Built for anyone running a form-driven process." />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CASES.map((c) => (
          <div key={c.title} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">{c.audience}</p>
            <p className="mt-2 font-display text-[15px] font-semibold text-[var(--color-ink)]">{c.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{c.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
