import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "@/components/marketing/Section";

const CAPABILITIES = [
  "Understand form fields and suggest mappings",
  "Explain grouped campaign failures",
  "Prepare campaign proposals and operational answers",
  "Support voice input with a browser speech fallback",
];

export function AiSection() {
  return (
    <Section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <SectionHeading
            eyebrow="Workflow AI"
            title="Intelligence that keeps the operator in control."
            description="Workflow AI helps your team understand forms, prepare work, and explain what needs attention. It proposes; permissions and confirmation still decide what happens."
          />
          <Link href="/features" className="mt-6 inline-flex text-[13.5px] font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-strong)]">
            Explore the product <span className="ml-1" aria-hidden="true">→</span>
          </Link>
        </Reveal>
        <Reveal delay={100}>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
              <div><p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">Operations brief</p><p className="text-[11.5px] text-[var(--color-muted)]">Available now · tenant-scoped</p></div>
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent-strong)]">READY</span>
            </div>
            <ul className="mt-4 space-y-3">
              {CAPABILITIES.map((item) => <li key={item} className="flex gap-2.5 text-[13px] text-[var(--color-ink-soft)]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />{item}</li>)}
            </ul>
            <div className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-[11.5px] text-[var(--color-muted)]">
              Coming later: deeper automation building and document intelligence as those capabilities are verified for production.
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
