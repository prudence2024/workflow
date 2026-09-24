import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminHeroSlideDiagnostics } from "@/lib/admin/server-fns";
import { joinInFlight } from "@/lib/in-flight-dedupe";

/**
 * §6 Admin diagnostics: shows exactly what the PUBLIC homepage will render for
 * each hero slide, with a reason whenever the resolver omits one — so Admin
 * never presents an apparently-healthy active slide while public silently
 * shows fewer.
 */
export type HeroOmission = {
  title: string;
  link: string;
  issue: string;
};

export type HeroDiagnostics =
  | {
      ok: true;
      totalSlides: number;
      publicRendered: number;
      omissions: HeroOmission[];
    }
  | { ok: false; message: string };

const ISSUE_LABELS: Record<string, string> = {
  source_missing: "Source record no longer exists — slide is not shown publicly",
  product_unpublished: "Linked product is unpublished — slide is not shown publicly",
  blog_unpublished: "Linked blog post is unpublished — slide is not shown publicly",
  link_invalid: "CTA link is not a resolvable product/blog reference",
};

export function HeroDiagnosticsPanel() {
  const fetchDiag = useServerFn(adminHeroSlideDiagnostics);
  const [diag, setDiag] = useState<HeroDiagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The hosting page mounts twice (verified live); join the duplicate call.
    joinInFlight("hero-slide-diagnostics", () => fetchDiag()).then(
      (res: HeroDiagnostics) => {
        if (!cancelled) setDiag(res);
      },
      () => {
        if (!cancelled) setDiag(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchDiag]);

  if (!diag) return null;

  if (!diag.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Hero diagnostics unavailable: {diag.message}</span>
      </div>
    );
  }

  if (diag.omissions.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>All {diag.totalSlides} active slides render publicly.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {diag.publicRendered} of {diag.totalSlides} active slides render on the public homepage.
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {diag.omissions.map((o, i) => (
          <li key={i} className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span>
              <span className="font-semibold">{o.title || "Untitled slide"}</span> —{" "}
              {ISSUE_LABELS[o.issue] ?? o.issue} ({o.link || "no link"})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
