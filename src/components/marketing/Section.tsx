import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1240px] px-6 py-20 md:py-28", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-white px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.12] text-[var(--color-ink)]">
        {title}
      </h2>
      {description && <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--color-muted)]">{description}</p>}
    </div>
  );
}
