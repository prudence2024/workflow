import { Section, SectionHeading } from "@/components/marketing/Section";

export default function AboutPage() {
  return (
    <Section className="pt-16">
      <SectionHeading
        eyebrow="About"
        title="We build operating systems for repetitive, high-stakes form work."
        description="Workflow started from a simple observation: the people running registrations, enrollments, and onboarding for real organizations were stitching together spreadsheets, email tools, and reminder apps that never talked to each other."
      />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-6">
          <p className="font-display text-[15px] font-semibold text-[var(--color-ink)]">What we believe</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            The person is the central object — not the spreadsheet. Every contact should carry their history forward
            across every campaign, every communication, and every follow-up.
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-6">
          <p className="font-display text-[15px] font-semibold text-[var(--color-ink)]">How we build</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            Reliable, safe, multi-tenant, scalable, recoverable, and observable — in that order. We would rather ship
            a smaller feature set that is trustworthy than a larger one that occasionally fails silently.
          </p>
        </div>
      </div>
    </Section>
  );
}
