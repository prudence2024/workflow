import { Link } from "@tanstack/react-router";
import { FileText, Mail, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isSafeRenderedHref, segmentTextLinks } from "@/lib/safe-text-links";

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

/**
 * Render a paragraph, turning email addresses and https URLs into safe
 * anchors (mailto:/https: only — see safe-text-links). Everything else stays
 * plain text. React escapes children, so this cannot inject markup.
 */
function renderSafeParagraph(paragraph: string) {
  return segmentTextLinks(paragraph).map((segment, i) => {
    if (segment.kind === "text") return segment.value;
    if (!isSafeRenderedHref(segment.href)) return segment.value;
    const external = segment.kind === "url";
    return (
      <a
        key={i}
        href={segment.href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
      >
        {segment.value}
      </a>
    );
  });
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-6 md:py-16">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {intro}
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
            <FileText className="size-3.5" />
            Last updated: 25 July 2026
          </p>
        </header>

        <div className="mx-auto mt-14 grid max-w-5xl gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Page contents" className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl bg-surface p-5 ring-1 ring-border">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                On this page
              </p>
              <ul className="mt-4 space-y-1">
                {sections.map((section, index) => (
                  <li key={section.title}>
                    <a
                      href={`#${slugify(section.title)}`}
                      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-card hover:text-ink"
                    >
                      <span className="text-[10px] font-bold tabular-nums text-brand">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="space-y-6">
            {sections.map((section, index) => (
              <section
                key={section.title}
                id={slugify(section.title)}
                className="scroll-mt-28 rounded-2xl bg-card p-6 ring-1 ring-border transition hover:shadow-soft sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 font-display text-sm font-bold tabular-nums text-brand">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-semibold leading-snug md:text-2xl">
                      {section.title}
                    </h2>
                    <div className="mt-4 space-y-4">
                      {section.paragraphs.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="text-sm leading-7 text-muted-foreground md:text-base"
                        >
                          {renderSafeParagraph(paragraph)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}

            <aside className="rounded-2xl bg-surface p-6 ring-1 ring-border sm:p-8">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                  <Mail className="size-5" />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-semibold">Questions about this page?</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Our team is happy to clarify how we handle your data or explain store terms.
                  </p>
                </div>
                <Link
                  to="/contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground"
                >
                  <ShieldCheck className="size-4" />
                  Contact support
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
