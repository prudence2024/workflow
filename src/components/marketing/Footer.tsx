import Link from "next/link";
import { BrandLockup } from "@/components/brand/Logo";
import { SOCIAL_URLS, type SocialNetwork } from "@/lib/socials";

function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === "x") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.88-6.38L6.5 22H3.4l7.24-8.28L2.8 2h6.4l4.4 5.82L18.9 2Zm-1.1 17.9h1.72L8.29 4H6.45L17.8 19.9Z" /></svg>;
  if (network === "linkedin") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M5.2 3.5A2.2 2.2 0 1 1 5.2 7.9a2.2 2.2 0 0 1 0-4.4ZM3.3 9.5h3.8V21H3.3V9.5Zm6.2 0h3.6v1.57h.05c.5-.95 1.73-1.95 3.56-1.95 3.8 0 4.5 2.5 4.5 5.75V21h-3.8v-5.44c0-1.3-.02-2.97-1.81-2.97-1.81 0-2.09 1.42-2.09 2.88V21H9.5V9.5Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.75 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /></svg>;
}

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
    title: "Solutions",
    links: [
      { href: "/use-cases", label: "Use cases" },
      { href: "/operations", label: "Operations" },
      { href: "/teams", label: "Teams" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/how-it-works", label: "How it works" },
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
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
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
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 text-[12.5px] text-[var(--color-muted)]">
          <p>© {new Date().getFullYear()} Workflow. All operations in flow.</p>
          <nav aria-label="Social links" className="flex items-center gap-2">
            {(Object.keys(SOCIAL_URLS) as SocialNetwork[]).map((network) => {
              const href = SOCIAL_URLS[network];
              if (!href) return null;
              return <a key={network} href={href} target="_blank" rel="noreferrer" aria-label={`Workflow on ${network}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:-translate-y-0.5 hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"><SocialIcon network={network} /></a>;
            })}
          </nav>
        </div>
      </div>
    </footer>
  );
}
