"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StyledSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  variant?: "public" | "admin";
}

/**
 * Consistent styled native select.
 * Uses native <select> for mobile-native UX (OS picker on iOS/Android)
 * with consistent visual styling matching the Diplomat design system.
 */
export function StyledSelect({
  label,
  options,
  placeholder,
  variant = "admin",
  className,
  ...props
}: StyledSelectProps) {
  const publicStyles =
    "border-border bg-card text-ink hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/15";
  const adminStyles =
    "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/30";

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      )}
      <div className="relative">
        <select
          className={cn(
            "w-full appearance-none cursor-pointer rounded-xl border px-3 py-2.5 pr-8 text-sm font-medium transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            variant === "public" ? publicStyles : adminStyles,
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}
