import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const controlClasses =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] transition-colors focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-soft)] disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-muted)]";

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--color-ink-soft)]">
        {children}
      </label>
      {hint && <span className="text-[11px] text-[var(--color-muted)]">{hint}</span>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, "min-h-[96px] py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(controlClasses, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function FieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-[var(--color-muted)]">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-medium text-[var(--color-danger)]">{children}</p>;
}
