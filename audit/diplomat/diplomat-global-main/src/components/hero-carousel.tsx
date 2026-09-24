import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import heroMonitor from "@/assets/hero-monitor.jpg";
import camera from "@/assets/product-camcorder.jpg";
import ultrawide from "@/assets/product-ultrawide.jpg";
import { formatNaira } from "@/lib/products";
import { heroSlideImage } from "@/lib/cloudinary-utils";
import { OptimizedImage } from "@/components/optimized-image";
import { isSafeCtaLink } from "@/lib/cloudinary-upload-policy";

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  alt: string;
  category: string;
  cta_text?: string;
  cta_link?: string;
  price_context?: string;
  /** What the slide is bound to (undefined for static/fallback slides). */
  sourceKind?: "product" | "blog" | null;
};

const FALLBACK_SLIDES: Slide[] = [
  {
    eyebrow: "New arrival",
    title: "Precision viewing. Unlimited power.",
    body: "Pro-grade colour accuracy for your mobile workstation, engineered for creatives who do not compromise.",
    image: heroMonitor,
    alt: "Portable 4K display on a modern creative workstation",
    category: "Monitor",
  },
  {
    eyebrow: "Creator essential",
    title: "Capture the moment in true 4K.",
    body: "Cinematic 60fps detail, clean audio and dependable battery life for every production day.",
    image: camera,
    alt: "Professional 4K camcorder",
    category: "Camera",
  },
  {
    eyebrow: "Game without limits",
    title: "More screen. More speed. Zero compromise.",
    body: "A curved ultrawide canvas with 165Hz performance built for immersive play and focused work.",
    image: ultrawide,
    alt: "Ultrawide gaming monitor",
    category: "Gaming Monitor",
  },
];

export function HeroCarousel({ dbSlides = [] }: { dbSlides?: Array<Record<string, unknown>> }) {
  const [active, setActive] = useState(0);
  const slides: Slide[] = dbSlides.length
    ? dbSlides.map((s) => ({
        eyebrow: (s.eyebrow as string) || "",
        title: (s.title as string) || "",
        body: (s.body as string) || "",
        image: (s.image as string) || FALLBACK_SLIDES[0].image,
        alt: (s.title as string) || "Promotion",
        category: (s.category as string) || "",
        cta_text: s.cta_text as string | undefined,
        cta_link: s.cta_link as string | undefined,
        price_context: s.price_context as string | undefined,
        sourceKind: (s.sourceKind as "product" | "blog" | null) ?? null,
      }))
    : FALLBACK_SLIDES;

  const [paused, setPaused] = useState(false);
  useEffect(() => {
    // WCAG 2.2.2: autoplay >5s must be pausable; prefers-reduced-motion
    // disables auto-advance entirely (motion-brief variant preserved on click).
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches || paused) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  const slide = slides[active] || slides[0];
  const go = (index: number) => setActive((index + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured highlights"
      className="relative overflow-hidden border-b border-border/60 bg-surface"
    >
      <div className="pointer-events-none absolute -left-32 top-8 size-80 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="mx-auto grid min-h-[640px] max-w-7xl items-center gap-10 px-5 py-12 sm:px-6 md:min-h-[620px] md:grid-cols-[0.86fr_1.14fr] md:py-16">
        <div className="relative z-10 min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            <span className="size-1.5 rounded-full bg-brand" />
            {slide.eyebrow}
          </span>
          <h1
            key={slide.title}
            className="animate-fade-up mt-6 max-w-xl font-display text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.055em] text-ink sm:text-5xl md:text-6xl"
          >
            {slide.title}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            {slide.body}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to={
                slide.cta_link && isSafeCtaLink(slide.cta_link)
                  ? slide.cta_link
                  : "/shop"
              }
              search={
                (slide.category ? { category: slide.category } : undefined) as
                  { category: string } | undefined
              }
              className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-inverse px-6 py-3 text-sm font-semibold text-inverse-foreground shadow-soft transition hover:-translate-y-0.5 hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {slide.cta_text || "Shop now"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(active - 1)}
              aria-label="Previous slide"
              className="grid size-10 place-items-center rounded-full border border-border bg-card text-ink transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume slideshow" : "Pause slideshow"}
              aria-pressed={paused}
              className="grid size-10 place-items-center rounded-full border border-border bg-card text-ink transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {paused ? (
                <Play className="size-4" aria-hidden />
              ) : (
                <Pause className="size-4" aria-hidden />
              )}
            </button>
            <div
              className="flex items-center gap-2"
              aria-label={`Slide ${active + 1} of ${slides.length}`}
            >
              {slides.map((item, index) => (
                <button
                  type="button"
                  key={`${item.title}-${index}`}
                  onClick={() => go(index)}
                  aria-label={`Show slide ${index + 1}: ${item.eyebrow}`}
                  aria-current={index === active}
                  className={`relative h-1.5 overflow-hidden rounded-full transition-all ${
                    index === active ? "w-10 bg-border" : "w-2 bg-border hover:bg-muted-foreground"
                  }`}
                >
                  {index === active && (
                    <span
                      key={active}
                      className="absolute inset-y-0 left-0 animate-[hero-progress_6.5s_linear_forwards] rounded-full bg-brand"
                    />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(active + 1)}
              aria-label="Next slide"
              className="grid size-10 place-items-center rounded-full border border-border bg-card text-ink transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="absolute -inset-4 rounded-[2.25rem] bg-brand/15 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] bg-inverse shadow-glow ring-1 ring-black/10">
            <div className="relative aspect-[4/3] w-full">
              {slides.map((item, index) => (
                <div
                  key={`${item.image}-${index}`}
                  aria-hidden={index !== active ? true : undefined}
                  className={`absolute inset-0 transition-all duration-700 ease-out ${
                    index === active ? "scale-100 opacity-100" : "scale-[1.04] opacity-0"
                  }`}
                >
                  {/* Only load the active slide and first slide to avoid 3x image overhead */}
                  {(index === 0 || index === active) && (
                    <OptimizedImage
                      src={heroSlideImage(item.image)}
                      alt={item.alt}
                      width={1600}
                      height={1200}
                      priority={index === 0}
                      className="!h-full !w-full"
                      containerClassName="!h-full !w-full"
                      aspectRatio="4/3"
                      sizes="(max-width: 767px) calc(100vw - 2.5rem), min(56vw, 45rem)"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 to-transparent p-6 pt-20 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                  {slide.sourceKind === "blog" ? "Diplomat Global blog" : "In stock · Lagos"}
                </p>
                <p className="mt-1 font-display text-sm font-semibold">
                  {slide.sourceKind === "blog" ? "Guides and reviews" : "Same-day dispatch"}
                </p>
              </div>
              <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[10px] font-semibold backdrop-blur">
                {slide.sourceKind === "blog" ? "Expert insights" : "12-month warranty"}
              </span>
            </div>
            <div className="absolute right-4 top-4 animate-float-y rounded-2xl border border-white/15 bg-black/35 px-3.5 py-2.5 text-white backdrop-blur-md">
              <div className="flex items-center gap-1 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3 fill-current" />
                ))}
              </div>
              <p className="mt-1 text-[10px] font-semibold">4.9 · 2,300+ reviews</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
