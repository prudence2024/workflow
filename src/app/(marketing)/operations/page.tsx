import { Section, SectionHeading } from "@/components/marketing/Section";
import { FlowCheck } from "@/components/ui/FlowIcon";

const STAGES = ["Import", "Organize", "Validate", "Map", "Automate", "Track", "Communicate", "Follow up", "Report"];

export default function OperationsPage() {
  return <Section className="pt-16"><SectionHeading eyebrow="Operations" title="A dependable lifecycle from first record to final report." description="Workflow gives every operational process the same visible structure: prepare the data, move the work, and keep proof of the outcome." /><div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{STAGES.map((stage, index) => <div key={stage} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><span className="font-mono-data text-[12px] text-[var(--color-brand)]">{String(index + 1).padStart(2, "0")}</span><div><h2 className="font-display text-[15px] font-semibold text-[var(--color-ink)]">{stage}</h2><p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">One observable stage in the operational loop.</p></div><span className="ml-auto text-[var(--color-accent)]"><FlowCheck /></span></div>)}</div></Section>;
}
