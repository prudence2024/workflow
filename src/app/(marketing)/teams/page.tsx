import { Section, SectionHeading } from "@/components/marketing/Section";
import { FlowCheck } from "@/components/ui/FlowIcon";

const TOPICS = ["Roles and workspace members", "Shared records with clear ownership", "Permissions that match the work", "Campaign accountability and audit evidence", "Collaboration around every workflow"];

export default function TeamsPage() {
  return <Section className="pt-16"><SectionHeading eyebrow="Teams" title="Give every operator context, ownership, and a clear next action." description="Workflow keeps collaboration close to the records and campaigns your team is responsible for, without losing the evidence behind each decision." /><div className="mt-12 grid gap-4 md:grid-cols-2">{TOPICS.map((topic) => <div key={topic} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"><span className="text-[var(--color-accent)]"><FlowCheck /></span><h2 className="mt-4 font-display text-[16px] font-semibold text-[var(--color-ink)]">{topic}</h2><p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">Keep the right people involved, make handoffs visible, and preserve a dependable history of what happened.</p></div>)}</div></Section>;
}
