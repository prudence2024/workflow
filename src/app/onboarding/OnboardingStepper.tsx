import Link from "next/link";

type Step = "workspace" | "details" | "plan" | "billing";

const STEPS = ["Workspace", "Details", "Plan", "Dashboard"] as const;
type StepKey = "workspace" | "details" | "plan" | "dashboard";
const STEP_KEYS: StepKey[] = ["workspace", "details", "plan", "dashboard"];

export function OnboardingStepper({ step, completedSteps }: { step: Step; completedSteps: Partial<Record<StepKey, boolean>> }) {
  const currentIndex = step === "workspace" ? 0 : step === "details" ? 1 : step === "plan" ? 2 : 3;

  return (
    <nav aria-label="Onboarding progress" className="mt-6">
      <ol className="grid grid-cols-4 gap-0">
        {STEPS.map((label, index) => {
          const completed = Boolean(completedSteps[STEP_KEYS[index]]) || index < currentIndex;
          const current = index === currentIndex;
          const href = index === 0 ? "/onboarding?step=workspace" : index === 1 ? "/onboarding?step=details" : index === 2 ? "/onboarding?step=plan" : "/dashboard";
          return (
            <li key={label} className="relative min-w-0 text-center">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2 ${index <= currentIndex ? "bg-[var(--color-brand)]" : "bg-[var(--color-border)]"}`}
                />
              )}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2 ${index < currentIndex ? "bg-[var(--color-brand)]" : "bg-[var(--color-border)]"}`}
                />
              )}
              {completed && !current ? <Link href={href} aria-label={`Return to ${label}`} className="relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-[12px] font-semibold text-white transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2">✓</Link> : <span aria-current={current ? "step" : undefined} aria-disabled={!current && !completed} className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold ${current ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand-strong)] ring-4 ring-[var(--color-brand-soft)]" : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-muted)]"}`}>{index + 1}</span>}
              {completed && !current ? <Link href={href} className="mt-2 block truncate text-[10.5px] font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand)]">{label}</Link> : <span aria-disabled={!current && !completed} className={`mt-2 block truncate text-[10.5px] ${current ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted)]"}`}>{label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
