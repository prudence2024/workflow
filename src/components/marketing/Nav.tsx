import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth";
import { MobileNav } from "@/components/marketing/MobileNav";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

export async function MarketingNav() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-[17px] font-semibold text-[var(--color-ink)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[var(--color-brand)] text-[13px] font-bold text-white">
            F
          </span>
          Formflow<span className="text-[var(--color-brand)]">Ops</span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <LinkButton href="/dashboard" size="sm">
              Go to dashboard
            </LinkButton>
          ) : (
            <>
              <Link href="/login" className="text-[13.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
                Log in
              </Link>
              <LinkButton href="/signup" size="sm">
                Start free
              </LinkButton>
            </>
          )}
        </div>

        <MobileNav links={LINKS} loggedIn={Boolean(user)} />
      </div>
    </header>
  );
}
