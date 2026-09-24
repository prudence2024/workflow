import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
      <div>
        <h3 className="font-display text-[15px] font-semibold text-[var(--color-ink)]">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="font-display text-[15px] font-semibold text-[var(--color-ink)]">{title}</p>
        {description && <p className="max-w-sm text-[13px] text-[var(--color-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const toneMap = {
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20",
    success: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20",
  } as const;
  return (
    <div className={cn("rounded-[var(--radius-sm)] border px-4 py-3 text-[13px]", toneMap[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
