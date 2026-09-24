import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Camera,
  FileText,
  Laptop,
  Monitor,
  Play,
  Printer,
  Quote,
  Star,
} from "lucide-react";
import { HeroCarousel } from "@/components/hero-carousel";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";
import { NewsletterSection } from "@/components/newsletter-section";
import { OptimizedImage, responsiveSrcSet } from "@/components/optimized-image";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { blogImage, heroSlideImage } from "@/lib/cloudinary-utils";
import { RESILIENCE_COPY, createLkgCache, failureCopy } from "@/lib/public-resilience";
import { useServerFn } from "@tanstack/react-start";
import { getPublicTestimonials } from "@/lib/admin/server-fns";

import { TESTIMONIALS, formatPostDate } from "@/lib/content";
import { type Product } from "@/lib/products";

const AVATAR_COLORS = [
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
];

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export const Route = createFileRoute("/")({
  head: ({ loaderData }: { loaderData?: { heroSlides?: { image?: string }[] } }) => ({
    meta: [
      { title: "Diplomat Global — Premium Electronics & Tech in Nigeria" },
      {
        name: "description",
        content:
          "Shop quality-checked monitors, cameras, computing gear and printers with secure checkout, nationwide delivery and local support.",
      },
      { property: "og:title", content: "Diplomat Global — Premium Electronics & Tech in Nigeria" },
      {
        property: "og:description",
        content: "Quality-checked technology, clear buying advice and nationwide delivery.",
      },
      {
        property: "og:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Diplomat Global — Premium Electronics & Tech in Nigeria" },
      {
        name: "twitter:description",
        content: "Quality-checked technology, clear buying advice and nationwide delivery.",
      },
      {
        name: "twitter:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
    ],
    links: [
      // Canonical homepage URL — same configured origin used by og:image above
      // (VITE_SITE_URL, production domain as fallback). Never a Preview URL.
      {
        rel: "canonical",
        href: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/`,
      },
      // LCP discovery: the hero image ships as the loader's first slide.
      // Preload + responsive imagesrcset keeps selection identical to the
      // rendered <img>, so mobile picks the small candidate and desktop the
      // large one — one fetch either way, discovered at HTML parse time.
      ...(loaderData?.heroSlides?.[0]?.image
        ? [
            {
              rel: "preload",
              as: "image",
              href: heroSlideImage(loaderData.heroSlides[0].image),
              imageSrcSet: responsiveSrcSet(loaderData.heroSlides[0].image) || undefined,
              imageSizes: "(max-width: 767px) calc(100vw - 2.5rem), min(56vw, 45rem)",
              fetchPriority: "high" as const,
            },
          ]
        : []),
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Diplomat Global Tech-Solutions",
          url: (import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, ""),
          logo: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
          contactPoint: {
            "@type": "ContactPoint",
            telephone: "+234-803-575-1338",
            contactType: "customer service",
          },
        }),
      },
    ],
  }),
  loader: async () => {
    let dbPosts: ReturnType<typeof mapBlogPost>[] = [];
    let dbFeatured: Product[] = [];
    let dbBestSellers: Product[] = [];
    let dbBestSellersRanked = false;
    let productsError = "";
    let blogError = "";
    let heroError = "";
    let heroSlides: any[] = [];
    let dbTestimonials: any[] = [];
    try {
      const [
        { getPublicHomeProductSections },
        { getPublicBlogPosts, getPublicHeroSlides, getPublicTestimonials },
      ] = await Promise.all([
        import("@/lib/best-sellers.server"),
        import("@/lib/admin/server-fns"),
      ]);
      const [sRes, bRes, hRes, tRes] = await Promise.allSettled([
        getPublicHomeProductSections({}),
        getPublicBlogPosts({}),
        getPublicHeroSlides({}),
        getPublicTestimonials({}),
      ]);
      if (hRes.status === "fulfilled" && hRes.value.slides?.length) heroSlides = hRes.value.slides;
      else if (hRes.status === "rejected") heroError = failureCopy(hRes.reason);
      if (tRes.status === "fulfilled" && tRes.value.testimonials?.length)
        dbTestimonials = tRes.value.testimonials;
      if (sRes.status === "fulfilled") {
        // Authoritative home product sections from one catalogue fetch:
        // featured = admin-flagged; bestSellers = top-4 by successful sales
        // with deterministic fallback fill (see best-sellers.server.ts).
        dbFeatured = sRes.value.featured as Product[];
        dbBestSellers = sRes.value.bestSellers as Product[];
        dbBestSellersRanked = sRes.value.bestSellersRanked === true;
      } else {
        productsError = failureCopy(sRes.reason);
      }
      const posts = bRes.status === "fulfilled" ? bRes.value.posts : undefined;
      if (bRes.status === "rejected") blogError = failureCopy(bRes.reason);
      if (posts?.length) {
        dbPosts = posts.map(mapBlogPost);
      }
    } catch (err) {
      console.error("[home loader] DB fetch failed:", err);
      productsError = failureCopy(err);
    }
    return {
      dbPosts,
      dbFeatured,
      dbBestSellers,
      dbBestSellersRanked,
      heroSlides,
      dbTestimonials,
      productsError,
      blogError,
      heroError,
    };
  },
  component: Home,
});

/**
 * Homepage blog card model. DB is the only source; a missing image maps to an
 * empty string so the OptimizedImage branded fallback renders instead of a
 * static sample asset that may itself be missing.
 */
function mapBlogPost(p: any) {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt || "",
    image: p.image || "",
    category: p.category || "News",
    date: p.published_at || p.created_at || "",
    readTime: p.read_time || "5 min read",
    watchTime: p.youtube_url ? "Watch" : undefined,
    videoUrl: p.youtube_url || undefined,
    content: (() => {
      try {
        const parsed = JSON.parse(p.content);
        if (Array.isArray(parsed)) return parsed.map((b: any) => b.text || String(b));
      } catch {
        /* best-effort: use fallback */
      }
      return p.content ? [p.content] : [];
    })(),
  };
}

/** Map DB category slugs to Lucide icons. Add new slugs here as categories are created. */
const CATEGORY_ICON_SLUGS: Record<string, typeof Monitor> = {
  computing: Laptop,
  monitor: Monitor,
  "gaming-monitor": Monitor,
  camera: Camera,
  "printers-scanner": Printer,
};

/** Fallback icon for unknown/new categories */
const DEFAULT_CATEGORY_ICON = Monitor;

function SectionHeading({
  eyebrow,
  title,
  link,
}: {
  eyebrow: string;
  title: string;
  link?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
        <span className="section-rule mt-3 block" aria-hidden />
      </div>
      {link && (
        <Link
          to={link}
          className="hidden items-center gap-1 text-sm font-semibold text-brand hover:underline sm:flex"
        >
          View all <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function TestimonialCarousel({ dbTestimonials = [] }: { dbTestimonials?: any[] }) {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const items = dbTestimonials.length
    ? dbTestimonials.map((t: any) => ({
        name: t.name,
        role: t.role || "",
        rating: t.rating || 5,
        message: t.message,
      }))
    : TESTIMONIALS;
  const [visible, setVisible] = useState(1);

  // Responsive visible count: 1 on mobile, 2 on md, 3 on lg+
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setVisible(3);
      else if (w >= 768) setVisible(2);
      else setVisible(1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const total = items.length;
  const INTERVAL_MS = 4000;
  const maxOffset = Math.max(0, total - visible);

  useEffect(() => {
    if (paused || total <= visible) {
      clearInterval(intervalRef.current);
      clearInterval(progressRef.current);
      return;
    }
    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (50 / INTERVAL_MS) * 100;
        return next >= 100 ? 100 : next;
      });
    }, 50);
    intervalRef.current = setInterval(() => {
      setOffset((prev) => (prev >= maxOffset ? 0 : prev + 1));
      setProgress(0);
    }, INTERVAL_MS);
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(progressRef.current);
    };
  }, [paused, total, maxOffset]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative"
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(calc(-${offset} * (100% / ${visible})))` }}
        >
          {items.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="w-full flex-shrink-0 px-2 md:w-1/2 lg:w-1/3"
            >
              <div className="flex h-full min-h-[260px] flex-col rounded-2xl bg-card p-6 ring-1 ring-border transition duration-300 hover:-translate-y-1 hover:shadow-soft">
                <Quote className="size-7 text-brand/80" />
                <div
                  className="mt-4 flex gap-0.5 text-amber-500"
                  aria-label={`${item.rating} out of 5 stars`}
                >
                  {Array.from({ length: item.rating }).map((_, starIndex) => (
                    <Star key={starIndex} className="size-3.5 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                  “{item.message}”
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-[10px] font-bold ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}
                    aria-hidden
                  >
                    {initialsOf(item.name)}
                  </span>
                  <span>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </span>
                </figcaption>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Progress bar */}
      {total > visible && (
        <div className="mt-6 flex items-center justify-center">
          <div className="h-1 w-48 overflow-hidden rounded-full bg-muted-foreground/15">
            <div
              className="h-full rounded-full bg-brand transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Last-known-good homepage sections; survives a failed revalidation. */
const homeLkg = createLkgCache<{
  dbPosts: ReturnType<typeof mapBlogPost>[];
  dbFeatured: Product[];
  dbBestSellers: Product[];
  dbBestSellersRanked: boolean;
  heroSlides: any[];
  dbTestimonials: any[];
  productsError: string;
  blogError: string;
  heroError: string;
}>();

function Home() {
  const data = Route.useLoaderData();
  // Last-known-good: a failed homepage revalidation keeps the previous
  // successful sections visible instead of blanking them.
  const cached = homeLkg.get("home");
  const failed = Boolean(data.productsError || data.blogError || data.heroError);
  const effective = failed && cached ? cached : data;
  useEffect(() => {
    if (!failed) homeLkg.set("home", data);
  }, [failed, data]);
  const {
    dbPosts,
    dbFeatured,
    dbBestSellers,
    dbBestSellersRanked,
    heroSlides,
    dbTestimonials,
    productsError,
    blogError,
    heroError,
  } = effective;
  const router = useRouter();
  const rootCtx = useRootLoaderData();
  const dbCategories = rootCtx.categories;
  const featured = dbFeatured;
  const bestSellers = dbBestSellers;
  // Truthful labelling (criticism F3): only claim "Best sellers" when the list
  // is actually ranked by real successful sales; a deterministic catalogue
  // fallback is labelled "Featured picks".
  const bestSellersTitle = dbBestSellersRanked ? "Best sellers" : "Featured picks";

  // Section isolation: a failed section shows a truthful retryable banner;
  // a section with data plus a failure keeps its data visible (stale).
  const staleStable = Boolean(productsError) && (featured.length > 0 || bestSellers.length > 0);
  const staleBlog = Boolean(blogError);
  const staleHero = Boolean(heroError);
  const staleNotice = failed && cached;
  const SectionAlert = ({ message }: { message: string }) => (
    <div
      role="alert"
      className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => void router.invalidate()}
        className="inline-flex min-h-9 items-center rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-brand"
      >
        {RESILIENCE_COPY.retry}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <HeroCarousel dbSlides={heroSlides} />
      <main>
        {staleNotice && !staleHero && <SectionAlert message={RESILIENCE_COPY.stale} />}
        {staleHero && <SectionAlert message={heroError} />}
        {productsError ? (
          <SectionAlert message={staleStable ? RESILIENCE_COPY.stale : productsError} />
        ) : bestSellers.length === 0 ? (
          <p role="status" className="mx-auto max-w-7xl px-5 py-4">
            No products are available yet.
          </p>
        ) : null}
        {/* Category strip — mobile horizontal scroll, desktop grid */}
        <section data-home-categories className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
          <SectionHeading eyebrow="Find your setup" title="Shop by category" link="/shop" />
          {rootCtx.categoriesUnavailable && (
            <SectionAlert
              message={`Unable to load product categories. ${RESILIENCE_COPY.unableToConnect}`}
            />
          )}
          <div
            className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {dbCategories.map((cat) => {
              const Icon = CATEGORY_ICON_SLUGS[cat.slug] ?? DEFAULT_CATEGORY_ICON;
              return (
                <Link
                  key={cat.id}
                  to="/shop"
                  search={{ category: cat.slug }}
                  className="flex-shrink-0 flex flex-col items-center justify-center min-w-[120px] rounded-2xl bg-surface p-4 text-ink ring-1 ring-border/60 transition duration-300 hover:bg-inverse hover:text-inverse-foreground"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-card text-brand ring-1 ring-border mb-2">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="text-xs font-semibold whitespace-nowrap">{cat.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-6 md:pb-20">
          <Reveal>
            <SectionHeading eyebrow="Selected for you" title="Featured technology" link="/shop" />
          </Reveal>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            {featured.map((product, index) => (
              <Reveal key={product.id} delay={(index % 4) * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </section>
        {/* removed */}
        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 md:py-20">
          <Reveal>
            <SectionHeading eyebrow="Popular now" title={bestSellersTitle} link="/shop" />
          </Reveal>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            {bestSellers.map((product, index) => (
              <Reveal key={product.id} delay={(index % 4) * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </section>
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 md:py-20">
            <Reveal>
              <SectionHeading
                eyebrow="The tech desk"
                title="Guides, reviews and honest advice"
                link="/blog"
              />
              {staleBlog && <SectionAlert message={blogError} />}
            </Reveal>
            {dbPosts.length === 0 && !staleBlog && (
              <div className="rounded-2xl border border-dashed border-border py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No articles have been published yet. Check back soon.
                </p>
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-3">
              {dbPosts.map((post, index) => (
                <Reveal key={post.slug} delay={index * 80} className="h-full">
                  <Link
                    to="/blog/$slug"
                    params={{ slug: post.slug }}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border transition duration-300 hover:-translate-y-1 hover:shadow-soft hover:ring-brand/40"
                  >
                    <div className="relative block overflow-hidden">
                      <OptimizedImage
                        src={blogImage(post.image)}
                        alt={post.title}
                        aspectRatio="16/10"
                        className="transition duration-500 group-hover:scale-105"
                      />
                      {post.videoUrl && (
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-black/30"
                          aria-label="Video post"
                        >
                          <Play aria-hidden="true" className="size-10 text-white" />
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-brand-foreground shadow-sm">
                        {post.category}
                      </span>
                    </div>
                    <div className="p-5">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatPostDate(post.date)} ·{" "}
                        {post.videoUrl ? (
                          <span className="inline-flex items-center gap-1">
                            <Play aria-hidden="true" className="h-3 w-3" />
                            {post.watchTime || "Watch"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <FileText aria-hidden="true" className="h-3 w-3" />
                            {post.readTime}
                          </span>
                        )}
                      </p>
                      <h3 className="mt-3 line-clamp-2 font-display text-lg font-semibold leading-snug hover:text-brand">
                        {post.title}
                      </h3>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 md:py-20">
          <Reveal>
            <SectionHeading eyebrow="Customer stories" title="Trusted after the checkout" />
          </Reveal>
          <TestimonialCarousel dbTestimonials={dbTestimonials} />
        </section>
      </main>
      <NewsletterSection />
      <SiteFooter />
    </div>
  );
}
