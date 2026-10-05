import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-strong)] shadow-[var(--shadow-xs)] disabled:opacity-50",
  secondary:
    "bg-[var(--color-ink)] text-[var(--color-canvas)] hover:bg-[var(--color-ink-soft)] disabled:opacity-50",
  outline:
    "border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-50",
  ghost: "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)] disabled:opacity-50",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-110 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-sm)]",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-[var(--radius-md)]",
};

const base =
  "inline-flex items-center justify-center font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand)] disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button className={cn(base, variantClasses[variant], sizeClasses[size], className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(base, variantClasses[variant], sizeClasses[size], className)}>
      {children}
    </Link>
  );
}
