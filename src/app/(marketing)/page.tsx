import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { Section, SectionHeading, Eyebrow } from "@/components/marketing/Section";
import { PipelineDemo } from "@/components/marketing/PipelineDemo";
import { MetricsStrip } from "@/components/marketing/MetricsStrip";
import { WorkflowProcess } from "@/components/marketing/WorkflowProcess";
import { AiSection } from "@/components/marketing/AiSection";
import { Reveal } from "@/components/motion/Reveal";
import { StatusPill } from "@/components/ui/Status";
import { hasMarketingSession } from "@/lib/marketingAuth";
import { HeroCopy } from "@/components/marketing/HeroCopy";
import { FlowArrow } from "@/components/ui/FlowIcon";

const AUDIENCES = ["Event organizers", "Schools", "Churches", "NGOs", "Agencies", "HR teams"];
const FEATURES = [
  ["Records", "One persistent history for every person, field, and follow-up.", "View the full contact timeline"],
  ["Forms & automation", "Analyze authorized forms, map data, and run durable submissions with truthful evidence.", "See form operations"],
  ["Campaigns", "Move cohorts through a clear queue with statuses your team can act on.", "Explore campaigns"],
  ["Email & SMS", "Communicate from the same operational context as the work.", "See communications"],
  ["Reminders", "Keep the next action visible instead of leaving it in an inbox.", "How it works"],
  ["Reporting", "Understand what completed, what failed, and what needs attention.", "View reporting"],
] as const;

export default async function HomePage() {
  const signedIn = await hasMarketingSession();

  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--color-border)] bg-[radial-gradient(circle_at_15%_0%,rgba(59,130,246,0.14),transparent_45%)]">
        <div className="mx-auto grid max-w-[1240px] gap-14 px-6 pb-20 pt-16 md:pt-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <Eyebrow>Connect · Automate · Move Forward</Eyebrow>
            <HeroCopy />
            <div className="mt-8 flex flex-wrap items-center gap-3"><LinkButton href={signedIn ? "/dashboard" : "/signup"} size="lg">{signedIn ? "Go to dashboard" : "Start free"} <FlowArrow className="ml-1" /></LinkButton><LinkButton href="/how-it-works" variant="outline" size="lg">See how Workflow works <FlowArrow className="ml-1" /></LinkButton></div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-ink-soft)]">Built for</span>{AUDIENCES.map((audience) => <span key={audience}>{audience}</span>)}</div>
          </Reveal>
          <Reveal delay={120}><PipelineDemo /></Reveal>
        </div>
      </section>

      <MetricsStrip />

      <Section>
        <SectionHeading eyebrow="The operating model" title="A calm system for work that usually feels scattered." description="Workflow brings people, forms, messages, and follow-up into one observable lifecycle — without pretending an unverified operation completed." />
        <WorkflowProcess />
      </Section>

      <Section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <SectionHeading eyebrow="The product" title="The modules your operation needs, connected by context." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map(([title, body, link], index) => <Reveal key={title} delay={index * 45}><div className="group h-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-sm)]"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">0{index + 1}</span><FlowArrow direction="up-right" className="text-[var(--color-accent)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><p className="mt-5 font-display text-[15px] font-semibold text-[var(--color-ink)]">{title}</p><p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{body}</p><Link href={title === "Forms & automation" ? "/product" : "/features"} className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-brand)]">{link} <FlowArrow className="transition-transform group-hover:translate-x-0.5" /></Link></div></Reveal>)}</div>
      </Section>

      <AiSection />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal><SectionHeading eyebrow="Records with memory" title="Every person becomes a persistent record." description="Not a spreadsheet row. A contact with campaign history, communications, documents, and a full timeline your team can rely on." /><ul className="mt-6 space-y-3 text-[13.5px] text-[var(--color-ink-soft)]">{["Campaign history across every registration", "Every email and reminder logged automatically", "Notes, tags, and next actions your team can trust"].map((item) => <li key={item} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />{item}</li>)}</ul></Reveal>
          <Reveal delay={100}><div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]"><div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4"><div><p className="font-display text-[15px] font-semibold">Grace Johnson</p><p className="text-[12px] text-[var(--color-muted)]">grace.j@mail.com · +234 801 234 5678</p></div><StatusPill status="active" /></div><div className="mt-4 space-y-4">{[{ time: "09:42", label: "Imported from Q1 Registrations.xlsx" }, { time: "09:43", label: "Validation passed" }, { time: "09:46", label: "Form submitted to Youth Conference 2026" }, { time: "09:47", label: "Confirmation email sent" }, { time: "09:48", label: "Email delivered" }].map((event, index, all) => <div key={event.time} className="flex gap-3"><div className="flex flex-col items-center"><span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />{index < all.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--color-border)]" />}</div><div className="pb-4"><p className="font-mono-data text-[11px] text-[var(--color-muted)]">{event.time}</p><p className="text-[13px] text-[var(--color-ink)]">{event.label}</p></div></div>)}</div></div></Reveal>
        </div>
      </Section>

      <Section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <SectionHeading eyebrow="Use cases" title="One workflow engine, many operations." description="Whatever the process, the operating model stays the same: people, forms, and follow-up." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{["Event registration", "School enrollment", "Membership & church records", "Employee onboarding"].map((title, index) => <Reveal key={title} delay={index * 45}><div className="h-full rounded-[var(--radius-md)] border border-[var(--color-border)] p-5"><p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">{title}</p><p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">Run the same dependable import, validation, communication, and reporting loop for this operation.</p></div></Reveal>)}</div>
      </Section>

      <Section>
        <div className="grid items-center gap-10 rounded-[var(--radius-lg)] border border-[var(--color-cta-border)] bg-[var(--color-cta)] px-8 py-12 sm:px-16 lg:grid-cols-[1.1fr_.9fr] lg:py-14"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">Ready to move forward?</p><h2 className="mt-4 font-display text-[clamp(1.8rem,3vw,2.5rem)] font-semibold text-[var(--color-cta-ink)]">Ready to put your operations in flow?</h2><p className="mt-3 max-w-lg text-[14.5px] text-[var(--color-cta-muted)]">Start free, bring in your first list, and see the full lifecycle from record to report.</p><div className="mt-8 flex flex-wrap gap-3"><LinkButton href={signedIn ? "/dashboard" : "/signup"} size="lg">{signedIn ? "Go to dashboard" : "Start free"}</LinkButton><Link href="/pricing" className="inline-flex h-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-cta-border)] px-6 text-[15px] font-medium text-[var(--color-cta-ink)] hover:bg-[var(--color-cta-hover)]">View pricing</Link></div></div><div aria-hidden="true" className="hidden lg:block"><div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-cta-border)] bg-[color-mix(in_srgb,var(--color-cta-ink)_6%,transparent)] p-5 text-[12px] text-[var(--color-cta-muted)]"><div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />Records ready</div><div className="ml-4 h-4 border-l border-[var(--color-cta-border)]" /><div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />Workflow in motion</div><div className="ml-4 h-4 border-l border-[var(--color-cta-border)]" /><div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />Outcome visible</div></div></div></div>
      </Section>
    </>
  );
}
