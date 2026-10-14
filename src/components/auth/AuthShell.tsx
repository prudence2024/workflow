import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/Logo";
import { PlatformAwareBrandLockup } from "@/components/brand/PlatformAwareBrandLockup";
import { FlowCheck } from "@/components/ui/FlowIcon";
import { cn } from "@/lib/utils";

export function AuthShell({ children, eyebrow = "Workflow setup", contentClassName, logoHref = "/login", platformAwareLogo = false, hideBrandPanel = false }: { children: ReactNode; eyebrow?: string; contentClassName?: string; logoHref?: string; platformAwareLogo?: boolean; hideBrandPanel?: boolean }) {
  return (
    <div className={cn("auth-shell grid min-h-screen bg-[var(--color-canvas)]", hideBrandPanel ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]")}>
      {!hideBrandPanel && <aside className="auth-brand-panel relative hidden overflow-hidden px-10 py-10 lg:flex lg:flex-col lg:justify-start xl:px-16">
        <div className="auth-brand-glow absolute inset-0" />
        <div className="relative">
          <div className="auth-logo-light">{platformAwareLogo ? <PlatformAwareBrandLockup size={30} /> : <BrandLockup href={logoHref} size={30} />}</div>
          <div className="auth-logo-dark">{platformAwareLogo ? <PlatformAwareBrandLockup size={30} tone="dark" /> : <BrandLockup href={logoHref} size={30} tone="dark" />}</div>
          <p className="auth-brand-text mt-12 max-w-md font-display text-[clamp(2rem,4vw,3.8rem)] font-semibold leading-[1.04]">
            Put every operation in flow.
          </p>
          <p className="auth-brand-muted mt-6 max-w-md text-[15px] leading-relaxed">
            Connect your records, automate the next action, and keep every outcome visible to the people doing the work.
          </p>
        </div>
        <div className="auth-brand-list relative mt-16 max-w-md divide-y border-y xl:mt-20">
          {["Import and validate", "Automate with control", "Communicate clearly", "Report with evidence"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 py-3 text-[12.5px]">
              <span className="text-[var(--color-accent)]"><FlowCheck /></span>{item}
              {index === 0 && <span className="auth-brand-active ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />}
            </div>
          ))}
        </div>
      </aside>}
      <main className="auth-main-panel flex min-w-0 flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10 lg:hidden">
          {platformAwareLogo ? <PlatformAwareBrandLockup size={28} /> : <BrandLockup href={logoHref} size={28} />}
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{eyebrow}</span>
        </header>
        <div className={cn("flex flex-1 items-center justify-center px-5 py-8 sm:px-10 lg:py-12", hideBrandPanel ? "lg:px-10 xl:px-16" : "lg:px-16")}>
          <div className={cn("w-full max-w-[560px]", contentClassName)}>{children}</div>
        </div>
      </main>
    </div>
  );
}
