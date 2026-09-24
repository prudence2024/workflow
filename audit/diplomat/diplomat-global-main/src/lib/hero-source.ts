/**
 * Hero source resolution (Owner addendum §1–§4).
 *
 * A hero slide whose `cta_link` points at a canonical product/blog route is a
 * SOURCE-BOUND slide: all presentation content is derived LIVE from the source
 * record on every public read. The stored row is only a snapshot fallback used
 * if the source fetch itself fails, and the slide is OMITTED entirely when the
 * source row is missing or not publicly visible (no dead Shop Now / Read More
 * links, no silent redirect to different content).
 *
 * Bound slides never render financial data (price/stock) — Hero is never
 * authority for price, stock, availability, discount, or product existence.
 *
 * Slides with any other link (e.g. /shop) are STATIC: stored fields pass
 * through, with a scheme allowlist on the destination.
 *
 * NOTE (Owner addendum §3): per-field presentation overrides would require a
 * new column to distinguish an override from a save-time snapshot; the current
 * schema does not support that cleanly, so bound slides always derive live.
 */

export type HeroSourceKind = "product" | "blog";

export interface ParsedHeroSource {
  kind: HeroSourceKind;
  slug: string;
}

export interface HeroProductSource {
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  status: string;
  image: string | null;
  categoryName: string | null;
}

export interface HeroBlogSource {
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  image: string | null;
  youtubeUrl: string | null;
  status: string;
}

export interface ResolvedHeroSlide {
  eyebrow: string;
  title: string;
  body: string;
  image: string | null;
  alt: string;
  category: string;
  cta_text: string;
  cta_link: string;
  /** True when the slide is bound to a live product/blog record. */
  bound: boolean;
  /** What the slide is bound to (null for static slides). */
  sourceKind: HeroSourceKind | null;
  /** Set when a bound slide was omitted (missing/unpublished source). */
  omitted?: boolean;
}

/** A bound slide that will NOT render publicly, with the proven reason. */
export interface HeroOmission {
  slide: Record<string, unknown>;
  source: ParsedHeroSource;
  issue: "source_missing" | "product_unpublished" | "blog_unpublished";
}

/** Parse a hero slide's cta_link into a canonical source reference. */
export function parseHeroSourceLink(ctaLink: string | null | undefined): ParsedHeroSource | null {
  if (!ctaLink) return null;
  let path = ctaLink.trim();
  if (!path.startsWith("/")) return null;
  // Strip query + hash, then a single trailing slash.
  path = path.split(/[?#]/)[0].replace(/\/+$/, "");
  const productMatch = /^\/products\/([^/]+)$/.exec(path);
  if (productMatch) return { kind: "product", slug: productMatch[1] };
  const blogMatch = /^\/blog\/([^/]+)$/.exec(path);
  if (blogMatch) return { kind: "blog", slug: blogMatch[1] };
  return null;
}

const FALLBACK_STATIC_LINK = "/shop";

/** Shared whitespace-collapse rule so lookups and comparisons never drift. */
export function collapseHeroSlug(slug: string): string {
  return slug.replace(/\s+/g, "");
}

/** Static destinations must be same-origin relative or https — never other schemes. */
export function sanitizeStaticHeroLink(link: string | null | undefined): string {
  if (!link) return FALLBACK_STATIC_LINK;
  const trimmed = link.trim();
  if (/^\/(?!\/)/.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return FALLBACK_STATIC_LINK;
}

/** Snapshot fallback for a bound slide whose source fetch FAILED. */
function snapshotSlide(slide: Record<string, unknown>, kind: HeroSourceKind): ResolvedHeroSlide {
  return {
    eyebrow: (slide.eyebrow as string) || "",
    title: (slide.title as string) || "",
    body: (slide.body as string) || "",
    image: (slide.image as string) || null,
    alt: (slide.title as string) || "Promotion",
    category: (slide.category as string) || "",
    cta_text: (slide.cta_text as string) || "Shop now",
    cta_link: sanitizeStaticHeroLink(slide.cta_link as string | undefined),
    bound: true,
    sourceKind: kind,
  };
}

function firstLine(text: string | null, max = 140): string {
  if (!text) return "";
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function deriveProductSlide(source: HeroProductSource): ResolvedHeroSlide {
  const eyebrow = source.categoryName || "Featured product";
  const body = source.tagline || firstLine(source.description) || "";
  return {
    eyebrow,
    title: source.name,
    body,
    image: source.image,
    alt: source.name,
    category: source.categoryName || "",
    cta_text: "Shop now",
    cta_link: `/products/${source.slug}`,
    bound: true,
    sourceKind: "product",
  };
}

export function deriveBlogSlide(source: HeroBlogSource): ResolvedHeroSlide {
  const isVideo = Boolean(source.youtubeUrl);
  return {
    eyebrow: source.category || "From the blog",
    title: source.title,
    body: firstLine(source.excerpt) || "",
    image: source.image,
    alt: source.title,
    category: source.category || "",
    cta_text: isVideo ? "Watch now" : "Read more",
    cta_link: `/blog/${source.slug}`,
    bound: true,
    sourceKind: "blog",
  };
}

/**
 * Resolve raw hero_slides rows against live product/blog records.
 *
 * `loadProducts`/`loadBlogs` receive the distinct slugs referenced by the
 * slides and return maps keyed by slug (missing slug = absent from map).
 * `loadProductImage` returns the canonical first image URL for a product.
 */
export async function resolveHeroSlides(
  rawSlides: Array<Record<string, unknown>>,
  loaders: {
    loadProducts: (slugs: string[]) => Promise<Map<string, HeroProductSource>>;
    loadProductImage: (slug: string) => Promise<string | null>;
    loadBlogs: (slugs: string[]) => Promise<Map<string, HeroBlogSource>>;
    /**
     * Optional whitespace-insensitive fallback lookup (alnum-collapsed slug).
     * Recovering a slide whose stored link has whitespace that the stored slug
     * does not (or vice versa) keeps the SAME product reachable instead of
     * omitting it — never a different product: candidates are filtered to an
     * exact whitespace-insensitive match.
     */
    findProductBySlugCollapsed?: (collapsed: string) => Promise<HeroProductSource | null>;
  },
  /** Receives each bound slide omitted from the public result (Admin diagnosis). */
  onOmit?: (omission: HeroOmission) => void,
): Promise<ResolvedHeroSlide[]> {
  const parsed = rawSlides.map((slide) => ({
    slide,
    source: parseHeroSourceLink(slide.cta_link as string | undefined),
  }));

  const productSlugs = [
    ...new Set(parsed.filter((p) => p.source?.kind === "product").map((p) => p.source!.slug)),
  ];
  const blogSlugs = [
    ...new Set(parsed.filter((p) => p.source?.kind === "blog").map((p) => p.source!.slug)),
  ];

  const emptyProducts = new Map<string, HeroProductSource>();
  const emptyBlogs = new Map<string, HeroBlogSource>();
  // A REJECTED loader is a fetch failure: bound slides fall back to the stored
  // snapshot rather than vanishing. An empty map after success means the row
  // itself is missing/unpublished → the slide is omitted (no dead links).
  const [productsRes, blogsRes] = await Promise.all([
    productSlugs.length
      ? loaders
          .loadProducts(productSlugs)
          .then((m) => ({ map: m, failed: false as const }))
          .catch(() => ({ map: emptyProducts, failed: true as const }))
      : Promise.resolve({ map: emptyProducts, failed: false as const }),
    blogSlugs.length
      ? loaders
          .loadBlogs(blogSlugs)
          .then((m) => ({ map: m, failed: false as const }))
          .catch(() => ({ map: emptyBlogs, failed: true as const }))
      : Promise.resolve({ map: emptyBlogs, failed: false as const }),
  ]);
  const products = productsRes.map;
  const blogs = blogsRes.map;

  const resolved: ResolvedHeroSlide[] = [];
  for (const { slide, source } of parsed) {
    if (!source) {
      // Static slide: stored fields pass through with a sanitized destination.
      resolved.push({
        eyebrow: (slide.eyebrow as string) || "",
        title: (slide.title as string) || "",
        body: (slide.body as string) || "",
        image: (slide.image as string) || null,
        alt: (slide.title as string) || "Promotion",
        category: (slide.category as string) || "",
        cta_text: (slide.cta_text as string) || "Shop now",
        cta_link: sanitizeStaticHeroLink(slide.cta_link as string | undefined),
        bound: false,
        sourceKind: null,
      });
      continue;
    }
    if (source.kind === "product") {
      let record = products.get(source.slug);
      if (!record && !productsRes.failed) {
        const tolerant = await loaders.findProductBySlugCollapsed?.(collapseHeroSlug(source.slug));
        if (tolerant) record = tolerant;
      }
      // Publicly visible = active catalogue row. Out-of-stock is NOT omitted:
      // the storefront normally keeps sellable-page availability, and Hero
      // never claims stock state. Fetch FAILURE falls back to the stored
      // snapshot instead of omitting the slide.
      if (!record) {
        if (!productsRes.failed) {
          onOmit?.({ slide, source, issue: "source_missing" });
          continue;
        }
        resolved.push(snapshotSlide(slide, "product"));
        continue;
      }
      if (record.status !== "active") {
        onOmit?.({ slide, source, issue: "product_unpublished" });
        continue;
      }
      let image = record.image;
      if (image === undefined) image = await loaders.loadProductImage(source.slug);
      resolved.push(deriveProductSlide({ ...record, image: image ?? null }));
      continue;
    }
    const record = blogs.get(source.slug);
    if (!record) {
      if (!blogsRes.failed) {
        onOmit?.({ slide, source, issue: "source_missing" });
        continue;
      }
      resolved.push(snapshotSlide(slide, "blog"));
      continue;
    }
    if (record.status !== "published") {
      onOmit?.({ slide, source, issue: "blog_unpublished" });
      continue;
    }
    resolved.push(deriveBlogSlide(record));
  }
  return resolved;
}
