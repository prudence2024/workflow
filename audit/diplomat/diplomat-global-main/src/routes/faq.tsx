import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FAQ_ITEMS_FALLBACK, type FaqItem } from "@/lib/faq-fallback";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const Route = createFileRoute("/faq")({
  head: ({ loaderData }: { loaderData?: { items?: FaqItem[] } }) => ({
    meta: [
      { title: "Frequently asked questions — Diplomat Global" },
      {
        name: "description",
        content:
          "Answers about delivery, payment, returns, warranty claims and product availability at Diplomat Global.",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: (loaderData?.items ?? FAQ_ITEMS_FALLBACK).map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }),
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug: "faq" } });
      const content = result.page?.content;
      if (content) {
        const parsed = JSON.parse(content) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (item) =>
              typeof (item as FaqItem)?.question === "string" &&
              typeof (item as FaqItem)?.answer === "string",
          )
        ) {
          return { items: parsed as FaqItem[], pageTitle: result.page.title };
        }
      }
    } catch {
      /* DB unavailable or no published faq page — fall through to defaults */
    }
    return { items: FAQ_ITEMS_FALLBACK, pageTitle: "Frequently asked questions" };
  },
  component: FaqPage,
});

function FaqPage() {
  const { items, pageTitle } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 md:py-16">
        <header className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Help centre</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            {pageTitle || "Frequently asked questions"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Straight answers about orders, delivery, payment and support.
          </p>
        </header>

        <div className="mt-12 space-y-3">
          {items.map((item, index) => (
            <details
              key={item.question}
              id={slugify(item.question)}
              className="group scroll-mt-28 rounded-2xl bg-card ring-1 ring-border transition hover:shadow-soft"
              open={index === 0}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-6 pb-6 text-sm leading-7 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>

        <aside className="mt-10 rounded-2xl bg-surface p-6 ring-1 ring-border sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
              <Mail className="size-5" />
            </span>
            <div className="flex-1">
              <h2 className="font-display text-lg font-semibold">Still have a question?</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Our team replies during business hours, Monday to Saturday.
              </p>
            </div>
            <Link
              to="/contact"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground"
            >
              Contact support
            </Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
