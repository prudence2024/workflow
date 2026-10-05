import { Reveal } from "@/components/motion/Reveal";

const FACTS = [
  ["Multi-tenant", "Every workspace is isolated by design."],
  ["Permission-aware", "Roles and server checks stay in the loop."],
  ["AI-assisted", "Suggestions help; your team stays in control."],
  ["Audit-ready", "Operations keep a truthful, inspectable history."],
] as const;

export function MetricsStrip() {
  return (
    <div className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-[1240px] gap-px bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(([title, body], index) => (
          <Reveal key={title} delay={index * 40} className="bg-[var(--color-surface)] p-5">
            <p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-muted)]">{body}</p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
