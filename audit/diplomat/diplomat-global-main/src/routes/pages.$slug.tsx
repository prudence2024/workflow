import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { renderSafeTextParagraph } from "@/components/safe-paragraph";

/**
 * Canonical public surface for generic CMS pages (site_pages, status=published).
 *
 * Structured page types keep their dedicated routes (/about, /faq, /warranty,
 * /privacy-policy, /terms-and-conditions) — see pageHref() in public-search.ts.
 * This route exists so every OTHER admin-created slug has a real destination
 * instead of the former dead-end `/about#{slug}` anchor.
 *
 * Read-only: renders the stored page; nothing here mutates financial or
 * inventory state. Unknown/unpublished slugs render a graceful, truthful
 * "not available" state (noindex) — never a fabricated page.
 */

/** Safe slug guard: lowercase alphanumerics and single hyphens only. */
function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 120;
}

export const Route = createFileRoute("/pages/$slug")({
  head: ({ loaderData }: { loaderData?: { title?: string; found?: boolean } }) => ({
    meta: [
      {
        title: loaderData?.title
          ? `${loaderData.title} — Diplomat Global`
          : "Page — Diplomat Global",
      },
      // Unknown/unpublished slugs must not enter search indexes.
      ...(loaderData?.found ? [] : [{ name: "robots", content: "noindex" }]),
    ],
  }),
  loader: async ({ params }) => {
    const slug = (params.slug ?? "").toLowerCase().trim();
    if (!isSafeSlug(slug)) {
      return { found: false as const, title: "", paragraphs: [] as string[] };
    }
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug } });
      const page = result.page;
      if (!page) return { found: false as const, title: "", paragraphs: [] as string[] };

      // Generic pages store free-form content; render text blocks safely.
      const raw = typeof page.content === "string" ? page.content : "";
      const paragraphs = raw
        .split(/\n{2,}|\r\n{2,}/)
        .map((block: string) => block.replace(/<[^>]*>/g, "").trim())
        .filter(Boolean);
      return {
        found: true as const,
        title: typeof page.title === "string" ? page.title : slug,
        paragraphs,
      };
    } catch {
      // DB/network failure must not render fabricated content. Production
      // surfaces the truthful not-found state; in development a rethrow keeps
      // serverFn failures visible instead of silently masking them.
      if (import.meta.env.PROD) {
        return { found: false as const, title: "", paragraphs: [] as string[] };
      }
      throw new Error(
        "[pages/$slug] page lookup failed (dev only — production returns the not-found state)",
      );
    }
  },
  component: GenericPublicPage,
});

function GenericPublicPage() {
  const { found, title, paragraphs } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 md:py-16">
        {found ? (
          <article>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
              {title}
            </h1>
            <div className="mt-6 space-y-4 text-base leading-7 text-muted-foreground">
              {paragraphs.length > 0 ? (
                paragraphs.map((text: string, i: number) => (
                  <p key={i}>{renderSafeTextParagraph(text)}</p>
                ))
              ) : (
                <p>This page has no content yet. Please check back soon.</p>
              )}
            </div>
          </article>
        ) : (
          <div className="py-10 text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              Page not available
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              This page doesn't exist or isn't published yet.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground"
            >
              Go home
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
