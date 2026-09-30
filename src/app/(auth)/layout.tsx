import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-8 sm:p-12">
        <Link href="/" className="flex items-center gap-2 font-display text-[16px] font-semibold text-[var(--color-ink)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[var(--color-brand)] text-[13px] font-bold text-white">
            F
          </span>
          Workflow
        </Link>
        <div className="mx-auto w-full max-w-[380px] py-16">{children}</div>
        <p className="text-[12px] text-[var(--color-muted)]">
          © {new Date().getFullYear()} Workflow. All rights reserved.
        </p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-ink)] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-center gap-8 px-14">
          <p className="font-display text-[28px] font-semibold leading-tight text-white">
            Import → Validate → Submit → Track → Report.
          </p>
          <div className="space-y-4">
            {["Persistent contact records", "Asynchronous, retryable submissions", "Human Action Required — never bypassed", "Multi-tenant by design"].map(
              (item) => (
                <div key={item} className="flex items-center gap-3 text-[13.5px] text-white/80">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px] text-white">✓</span>
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
