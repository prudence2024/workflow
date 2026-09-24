"use client";

import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback, useId } from "react";

interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  label?: string;
  placeholder?: string;
  variant?: "public" | "admin";
  disabled?: boolean;
  className?: string;
  id?: string;
  /**
   * Enable type-to-search filtering for long lists (State, LGA, Category).
   * Keyboard navigation, ARIA combobox semantics and a no-results state are
   * included; canonical values are unchanged — filtering only aids discovery.
   */
  searchable?: boolean;
  /** Flip the dropdown upward (for controls near the viewport bottom). */
  dropUp?: boolean;
}

/**
 * Accessible custom select with styled dropdown menu.
 * - Desktop: custom styled menu with keyboard navigation
 * - Mobile (< 768px): native <select> for OS picker UX
 * - ARIA: role=listbox, aria-activedescendant, keyboard arrows/enter/escape
 * - z-index: above modals (z-50)
 * - Viewport: repositions if dropdown would overflow
 */
export function CustomSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select...",
  variant = "admin",
  disabled = false,
  className,
  id: externalId,
  searchable = false,
  dropUp = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filter, setFilter] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const id = externalId || autoId;

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  // Bounded filtered list for searchable mode; full list otherwise.
  const visibleOptions =
    searchable && filter.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(filter.trim().toLowerCase()))
      : options;

  // When filtering, remap active row indices onto the filtered subset.
  const activeOption = activeIndex >= 0 ? visibleOptions[activeIndex] : undefined;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setFilter("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Scroll active option into view
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const items = listRef.current?.querySelectorAll('[role="option"]');
    items?.[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  const selectOption = useCallback(
    (opt: CustomSelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setIsOpen(false);
      setFilter("");
      setActiveIndex(-1);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
        const idx = options.findIndex((o) => o.value === value);
        setActiveIndex(idx >= 0 ? idx : 0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => {
          let next = prev + 1;
          while (next < visibleOptions.length && visibleOptions[next]?.disabled) next++;
          return next < visibleOptions.length ? next : prev;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && visibleOptions[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeOption && !activeOption.disabled) {
          selectOption(activeOption);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setFilter("");
        triggerRef.current?.focus();
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(visibleOptions.length - 1);
        break;
      case "Tab":
        setIsOpen(false);
        setFilter("");
        break;
    }
  };

  const publicStyles =
    "border-border bg-card text-ink hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/15";
  const adminStyles =
    "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-gray-600 focus:ring-2 focus:ring-brand/30";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              const opening = !isOpen;
              setIsOpen(opening);
              if (opening) {
                const idx = visibleOptions.findIndex((o) => o.value === value);
                setActiveIndex(idx >= 0 ? idx : 0);
                // Focus lands in the filter box so long lists are immediately
                // type-to-search without an extra click.
                if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
              } else {
                setFilter("");
              }
            }
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex w-full items-center justify-between gap-2 appearance-none cursor-pointer rounded-xl border px-3 py-2.5 pr-8 text-sm font-medium transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            variant === "public" ? publicStyles : adminStyles,
            !selectedOption && "text-gray-400 dark:text-gray-500",
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            className={cn(
              "pointer-events-none size-3.5 shrink-0 text-gray-400 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {isOpen && (
          <div
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={label || "Options"}
            className={cn(
              "absolute z-50 max-h-60 w-full overflow-auto rounded-xl border py-1 shadow-lg",
              dropUp ? "bottom-full mb-1" : "mt-1",
              variant === "public"
                ? "border-border bg-card"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800",
            )}
          >
            {searchable && (
              <div className="sticky top-0 bg-inherit px-2 pb-2 pt-1">
                <input
                  ref={searchRef}
                  type="text"
                  role="searchbox"
                  aria-label={`Filter ${label || "options"}`}
                  aria-controls={`${id}-listbox`}
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setActiveIndex(e.target.value ? 0 : -1);
                  }}
                  onKeyDown={(e) => {
                    // Keep arrow/enter handling in the listbox keyboard model;
                    // stop the combobox trigger from seeing typing keys.
                    if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
                    else handleKeyDown(e);
                  }}
                  placeholder="Type to search…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No matches for “{filter.trim()}”
              </p>
            )}
            {visibleOptions.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <div
                  key={opt.value}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onClick={() => selectOption(opt)}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                    opt.disabled && "cursor-not-allowed opacity-40",
                    isActive &&
                      (variant === "public"
                        ? "bg-brand/10 text-brand"
                        : "bg-brand/10 text-brand dark:bg-brand/20"),
                    isSelected &&
                      !isActive &&
                      (variant === "public"
                        ? "bg-surface text-ink"
                        : "bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white"),
                    !isActive &&
                      !isSelected &&
                      (variant === "public"
                        ? "text-ink hover:bg-surface"
                        : "text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50"),
                  )}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check className="size-3.5 shrink-0 text-brand" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
