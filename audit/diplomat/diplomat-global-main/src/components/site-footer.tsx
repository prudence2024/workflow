import { Link } from "@tanstack/react-router";
import { ExternalLink, Globe2, Lock, Mail, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/social-icons";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ConsentPreferencesLink } from "@/components/consent-preferences-link";
import { getSocialIcon } from "@/components/social-icons";
import {
  buildFooterModel,
  type FooterContactRow,
  type SocialLike,
} from "@/lib/public-content-model";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";

const QUICK_LINKS: { label: string; to: string; hash?: string }[] = [
  { label: "Products / Shop", to: "/shop" },
  { label: "Contact Us", to: "/contact" },
  { label: "Leave a Review", to: "/reviews" },
  { label: "FAQ", to: "/faq" },
  { label: "Blog", to: "/blog" },
];

const COMPANY_LINKS: { label: string; to: string }[] = [
  { label: "About Us", to: "/about" },
  { label: "Warranty & Returns", to: "/warranty" },
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms & Conditions", to: "/terms-and-conditions" },
];

function SocialIcons({ links }: { links: SocialLike[] }) {
  if (links.length === 0) return null;
  return (
    <nav
      className="mt-5 flex flex-wrap gap-2.5"
      aria-label="Diplomat Global social media"
      data-footer-social-source="social-links"
    >
      {links.map((social) => {
        const Icon = getSocialIcon(social.platform, social.icon);
        return (
          <a
            key={social.id}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Diplomat Global on ${social.platform}`}
            title={social.platform}
            data-footer-social-link={social.platform}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-inverse-foreground/5 text-inverse-foreground/60 ring-1 ring-inverse-foreground/10 transition duration-200 hover:-translate-y-0.5 hover:bg-brand hover:text-brand-foreground hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon aria-hidden="true" className="size-4" />
          </a>
        );
      })}
    </nav>
  );
}

function ContactRowIcon({ kind }: { kind: FooterContactRow["kind"] }) {
  const className = "size-4";
  switch (kind) {
    case "address":
      return <MapPin aria-hidden="true" className={className} />;
    case "email":
      return <Mail aria-hidden="true" className={className} />;
    case "phone":
      return <Phone aria-hidden="true" className={className} />;
    case "whatsapp":
      return <WhatsAppIcon aria-hidden="true" className={className} />;
    default:
      return <Globe2 aria-hidden="true" className={className} />;
  }
}

function ContactRow({ row }: { row: FooterContactRow }) {
  const content = row.href ? (
    <a
      href={row.href}
      target={row.external ? "_blank" : undefined}
      rel={row.external ? "noopener noreferrer" : undefined}
      className={
        row.kind === "email"
          ? "break-all transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          : "break-words transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      }
    >
      {row.value}
    </a>
  ) : (
    <span className="break-words leading-relaxed">{row.value}</span>
  );
  return (
    <div className="flex min-w-0 items-start gap-3.5" data-footer-contact={row.kind}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-inverse-foreground/5">
        <ContactRowIcon kind={row.kind} />
      </span>
      <div className="min-w-0 pt-0.5 text-sm text-inverse-foreground/60">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-inverse-foreground/50">
          {row.label}
        </span>
        {content}
      </div>
    </div>
  );
}

export function SiteFooter() {
  // Consume pre-fetched footer data from root loader (no client-side fetches).
  const { socialLinks, siteSettings: settings, sharedDataStale } = useRootLoaderData();
  const model = buildFooterModel(socialLinks, settings);

  return (
    <footer className="bg-inverse text-inverse-foreground">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-x-10 gap-y-10 px-5 py-10 sm:grid-cols-2 sm:px-6 sm:py-14 lg:grid-cols-[1.35fr_1fr_1fr_1.2fr]">
        <div data-footer-section="brand" className="min-w-0">
          <h2 className="sr-only">Diplomat Global</h2>
          <BrandLogo darkBadge />
          <p className="mt-4 max-w-xs break-words text-sm leading-7 text-inverse-foreground/50">
            {model.description}
          </p>
          <SocialIcons links={model.socialIcons} />
        </div>

        <FooterCol sectionKey="quick-links" title="Quick Links" links={QUICK_LINKS} />
        <FooterCol sectionKey="company" title="Company" links={COMPANY_LINKS} />

        <div data-footer-section="contact" className="min-w-0">
          <FooterHeading>Contact</FooterHeading>
          {sharedDataStale && (
            <p className="mb-4 text-xs text-inverse-foreground/60" role="status">
              Connection is unstable. Showing the latest available business info.
            </p>
          )}
          <div className="space-y-5" data-footer-contact-source="site-settings">
            {model.contactRows.map((row) => (
              <ContactRow key={row.kind} row={row} />
            ))}
            {model.contactRows.length === 0 && (
              <p className="text-sm text-inverse-foreground/50">Contact details not configured.</p>
            )}
          </div>
          {model.communityCtas.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {model.communityCtas.map((cta) => (
                <a
                  key={cta.id}
                  href={cta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-inverse-foreground/5 px-3 text-xs font-semibold text-inverse-foreground/70 ring-1 ring-inverse-foreground/10 transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span>{cta.platform === "custom" ? cta.icon || "Community" : cta.platform}</span>
                  <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-inverse-foreground/10 bg-inverse-foreground/[0.02]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-inverse-foreground/50 sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} {model.companyName}. All rights reserved.
          </span>
          <span className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
            <ConsentPreferencesLink />
            <span className="flex items-center gap-1.5">
              <Lock className="size-3" />
              Powered by Paystack
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  sectionKey,
  title,
  links,
}: {
  sectionKey: string;
  title: string;
  links: { label: string; to: string; hash?: string }[];
}) {
  return (
    <div data-footer-section={sectionKey} className="min-w-0">
      <FooterHeading>{title}</FooterHeading>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              hash={link.hash}
              className="inline-flex min-h-11 items-center text-sm text-inverse-foreground/60 transition duration-200 hover:translate-x-0.5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-inverse-foreground/50">
      {children}
    </h2>
  );
}
