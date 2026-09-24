import { useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { X, ArrowLeft, AlertTriangle, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Called when drawer requests close */
  onClose: () => void;
  /** Main title */
  title: string;
  /** Optional subtitle (e.g. reference ID) */
  subtitle?: string;
  /** Status badge element */
  badge?: React.ReactNode;
  /** Action buttons in the header */
  actions?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Access denied state */
  accessDenied?: boolean;
  /** Not found state */
  notFound?: boolean;
  /** Children content (the detail body) */
  children?: React.ReactNode;
}

/**
 * Professional detail drawer:
 * - Desktop: right-side slide-in panel (w-[520px] or w-full)
 * - Mobile: full-screen sheet
 * - Synced with URL: open when $id is present, close navigates back
 * - Sticky header with title + status + actions
 * - Scrollable body
 * - States: loading, error, not found, access denied, empty, success
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  actions,
  loading,
  error,
  accessDenied,
  notFound,
  children,
}: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap focus + restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on backdrop click (desktop only)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity md:bg-black/50"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "bg-white dark:bg-[#0F0F12] shadow-2xl",
          "w-full sm:w-[520px]",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        {/* ── Sticky Header ── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition shrink-0"
              aria-label="Close"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
              <p className="text-sm text-gray-500">Loading details…</p>
            </div>
          )}

          {!loading && accessDenied && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
              <div className="p-3 rounded-full bg-red-50 dark:bg-red-900/20">
                <ShieldOff className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Access Denied</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                {error || "You do not have permission to view this record."}
              </p>
            </div>
          )}

          {!loading && !accessDenied && notFound && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
              <div className="p-3 rounded-full bg-gray-50 dark:bg-gray-800">
                <AlertTriangle className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Not Found</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                {error || "This record could not be found."}
              </p>
            </div>
          )}

          {!loading && !accessDenied && !notFound && error && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
              <div className="p-3 rounded-full bg-orange-50 dark:bg-orange-900/20">
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Something went wrong
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">{error}</p>
            </div>
          )}

          {!loading && !accessDenied && !notFound && !error && !children && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
              <p className="text-sm text-gray-400">No data available.</p>
            </div>
          )}

          {!loading && !accessDenied && !notFound && !error && children}
        </div>
      </div>
    </>
  );
}

/**
 * DetailDrawerSection — a card-like section within the drawer body.
 */
export function DetailDrawerSection({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/30">
        {icon && <span className="text-gray-400">{icon}</span>}
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h4>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/**
 * DetailField — a label/value pair for the drawer.
 */
export function DetailField({
  label,
  children,
  mono,
  className,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className={cn("text-sm text-gray-900 dark:text-white", mono && "font-mono")}>
        {children || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}
