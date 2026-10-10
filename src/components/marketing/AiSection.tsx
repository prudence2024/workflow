import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { AiDemo } from "@/components/marketing/AiDemo";
import { FlowArrow } from "@/components/ui/FlowIcon";

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
          <Link href="/features" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-strong)]">
            Explore the product <FlowArrow />
          </Link>
        </Reveal>
        <Reveal delay={100}>
          <AiDemo />
        </Reveal>
      </div>
    </Section>
  );
}
