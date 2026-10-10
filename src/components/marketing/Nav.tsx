import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { hasMarketingSession } from "@/lib/marketingAuth";
import { MobileNav } from "@/components/marketing/MobileNav";
import { BrandLockup } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

export async function MarketingNav() {
  const signedIn = await hasMarketingSession();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <BrandLockup href="/" size={30} />

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
          <ThemeToggle compact />
          {signedIn ? (
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

        <MobileNav links={LINKS} loggedIn={signedIn} />
      </div>
    </header>
  );
}
