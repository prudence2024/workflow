import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChevronDown, ShieldCheck, Truck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { OptimizedImage } from "@/components/optimized-image";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About us — Diplomat Global" },
      {
        name: "description",
        content:
          "Learn how Diplomat Global helps Nigerian customers buy technology with confidence.",
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug: "about" } });
      if (result.page?.content) {
        try {
          const parsed = JSON.parse(result.page.content);
          if (parsed && typeof parsed === "object") {
            return { pageData: parsed };
          }
        } catch {
          /* not JSON */
        }
      }
    } catch {
      /* DB unavailable */
    }
    return { pageData: null };
  },
  component: About,
});

function About() {
  const { pageData } = Route.useLoaderData();
  const heading = pageData?.heading || "Technology you can buy with confidence.";
  const description =
    pageData?.description ||
    "We help professionals, creators, students and businesses choose quality-checked technology with honest specifications, clear pricing and dependable after-sales support.";
  const founder = pageData?.founder;
  const dbFaq = pageData?.faq;

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 md:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              About Diplomat Global
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-6xl">
              {heading}
            </h1>
            <p className="mt-6 text-base leading-8 text-muted-foreground">{description}</p>
            <Link
              to="/shop"
              search={{}}
              className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
            >
              Explore the store
            </Link>
          </div>
          {/* LCP image: priority + responsive srcset via OptimizedImage (sizes
              drive a Cloudinary f_auto/q_auto srcset for any Cloudinary URL and
              keep the local asset fetch bounded by the layout width). */}
          <OptimizedImage
            src="/content/hero/slide-3.jpg"
            alt="A modern technology setup"
            priority
            width={1200}
            height={900}
            aspectRatio="4/3"
            sizes="(max-width: 1024px) 100vw, 50vw"
            containerClassName="rounded-3xl"
          />
        </section>

        {/* Values */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-6 md:grid-cols-3">
            {[
              [
                CheckCircle2,
                "Checked before dispatch",
                "We verify condition and core functions before an item leaves us.",
              ],
              [
                ShieldCheck,
                "Clear protection",
                "Warranty expectations are explained before purchase, not after a fault.",
              ],
              [
                Truck,
                "Supported delivery",
                "Customers receive practical updates from payment through delivery.",
              ],
            ].map(([Icon, title, body]) => (
              <article key={String(title)} className="rounded-2xl bg-card p-6 ring-1 ring-border">
                <Icon className="size-6 text-brand" />
                <h2 className="mt-5 font-display text-xl font-semibold">{String(title)}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{String(body)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Founder Section — only shown when admin provides founder data */}
        {founder && founder.name && (
          <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[340px_1fr] lg:items-center">
              {founder.photo && (
                <OptimizedImage
                  src={founder.photo}
                  alt={founder.name}
                  width={680}
                  height={907}
                  aspectRatio="3/4"
                  sizes="(max-width: 1024px) 80vw, 340px"
                  containerClassName="max-w-[340px] rounded-2xl"
                />
              )}
              <div>
                {founder.quote && (
                  <blockquote className="mb-6 border-l-2 border-brand pl-4 text-lg italic text-muted-foreground">
                    &ldquo;{founder.quote}&rdquo;
                  </blockquote>
                )}
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
                  {founder.title || "Founder"}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
                  {founder.name}
                </h2>
                {founder.bio && (
                  <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground md:text-base">
                    {founder.bio
                      .split("\n")
                      .filter(Boolean)
                      .map((para: string, i: number) => (
                        <p key={i}>{para}</p>
                      ))}
                  </div>
                )}
                {founder.story && (
                  <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-border">
                    <h3 className="font-display text-lg font-semibold mb-3">Our Story</h3>
                    <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                      {founder.story
                        .split("\n")
                        .filter(Boolean)
                        .map((para: string, i: number) => (
                          <p key={i}>{para}</p>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* FAQ Section — DB-persisted or hardcoded fallback */}
        <FAQSection dbFaq={dbFaq} />
      </main>
      <SiteFooter />
    </div>
  );
}

function FAQSection({
  dbFaq,
}: {
  dbFaq?: Array<{ question: string; answer: string; enabled?: boolean }>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs =
    dbFaq && dbFaq.length > 0
      ? dbFaq.filter((f) => f.enabled !== false).map((f) => ({ q: f.question, a: f.answer }))
      : [];

  return (
    <section id="faq" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 sm:px-6 md:py-24">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
        Common questions
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
        Frequently asked questions
      </h2>
      <p className="mt-4 text-base text-muted-foreground">
        Quick answers to the things our customers ask most.
      </p>
      <div className="mt-10 divide-y divide-border">
        {faqs.map((faq, index) => (
          <div key={index} className="py-1">
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="flex w-full items-center justify-between gap-4 py-9 text-left"
              aria-expanded={openIndex === index}
            >
              <span className="font-display text-base font-semibold text-ink md:text-lg">
                {faq.q}
              </span>
              <ChevronDown
                className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                  openIndex === index ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                openIndex === index ? "max-h-96 pb-5" : "max-h-0"
              }`}
            >
              <p className="text-sm leading-7 text-muted-foreground">{faq.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
