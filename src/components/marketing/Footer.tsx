import Link from "next/link";

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
          <Link href="/" className="flex items-center gap-2 font-display text-[16px] font-semibold text-[var(--color-ink)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[var(--color-brand)] text-[13px] font-bold text-white">
              F
            </span>
            FormflowOps
          </Link>
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            The operations platform for form-driven processes — from spreadsheet to a controlled, trackable workflow
            with a persistent history for every person.
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
          © {new Date().getFullYear()} FormflowOps. All automation runs through authorized access only — the platform
          never bypasses CAPTCHA, OTP, or anti-bot protections.
        </p>
      </div>
    </footer>
  );
}
