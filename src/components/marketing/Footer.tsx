import Link from "next/link";
import { BrandLockup } from "@/components/brand/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Product" },
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/use-cases", label: "Use cases" },
      { href: "/security", label: "Security" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-white">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <BrandLockup href="/" size={30} />
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            Manage records, automate processes, communicate through bulk email and SMS, organize campaigns, schedule
            reminders and report on operations — all in one multi-tenant workspace.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{col.title}</p>
            <ul className="mt-3 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13.5px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-border)] px-6 py-5">
        <p className="mx-auto max-w-[1240px] text-[12.5px] text-[var(--color-muted)]">
          © {new Date().getFullYear()} Workflow. All automation runs through authorized access only — the platform
          never bypasses CAPTCHA, OTP, or anti-bot protections.
        </p>
      </div>
    </footer>
  );
}
