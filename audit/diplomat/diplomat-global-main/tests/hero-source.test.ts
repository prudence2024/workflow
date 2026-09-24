import { describe, expect, it } from "vitest";
import {
  parseHeroSourceLink,
  sanitizeStaticHeroLink,
  deriveProductSlide,
  deriveBlogSlide,
  resolveHeroSlides,
  type HeroProductSource,
  type HeroBlogSource,
} from "../src/lib/hero-source";

/**
 * Owner addendum §4 — Hero source integrity:
 * - canonical cta_link is the source identity (no new columns)
 * - bound slides derive content from the LIVE source record
 * - missing/unpublished sources are OMITTED (no dead Shop Now / Read More)
 * - static slides keep stored fields; destination scheme-allowlisted
 * - hero never carries financial authority (no price/stock in derived output)
 */

describe("parseHeroSourceLink", () => {
  it("parses canonical product and blog links", () => {
    expect(parseHeroSourceLink("/products/lumina-4k")).toEqual({ kind: "product", slug: "lumina-4k" });
    expect(parseHeroSourceLink("/blog/choosing-right-monitor")).toEqual({
      kind: "blog",
      slug: "choosing-right-monitor",
    });
  });

  it("strips query/hash/trailing slash before matching", () => {
    expect(parseHeroSourceLink("/products/apex-34?ref=x#top")).toEqual({ kind: "product", slug: "apex-34" });
    expect(parseHeroSourceLink("/blog/post/")).toEqual({ kind: "blog", slug: "post" });
  });

  it("returns null for non-source destinations", () => {
    expect(parseHeroSourceLink("/shop")).toBeNull();
    expect(parseHeroSourceLink("/products")).toBeNull(); // index, not a detail page
    expect(parseHeroSourceLink("https://evil.example/products/x")).toBeNull();
    expect(parseHeroSourceLink("javascript:alert(1)")).toBeNull();
    expect(parseHeroSourceLink("")).toBeNull();
    expect(parseHeroSourceLink(null)).toBeNull();
  });
});

describe("sanitizeStaticHeroLink", () => {
  it("allows relative paths and https only", () => {
    expect(sanitizeStaticHeroLink("/shop")).toBe("/shop");
    expect(sanitizeStaticHeroLink("https://example.com")).toBe("https://example.com");
    expect(sanitizeStaticHeroLink("javascript:alert(1)")).toBe("/shop");
    expect(sanitizeStaticHeroLink("http://insecure.example")).toBe("/shop");
    expect(sanitizeStaticHeroLink("")).toBe("/shop");
  });
});

describe("deriveProductSlide", () => {
  const src: HeroProductSource = {
    name: "Lumina 4K Camcorder",
    slug: "lumina-4k-camcorder",
    tagline: "Cinema in your pocket",
    description: "Long description…",
    status: "active",
    image: "https://res.cloudinary.com/x/img.jpg",
    categoryName: "Cameras",
  };

  it("derives name/category/CTA/destination, never price or stock", () => {
    const slide = deriveProductSlide(src);
    expect(slide.title).toBe("Lumina 4K Camcorder");
    expect(slide.eyebrow).toBe("Cameras");
    expect(slide.cta_text).toBe("Shop now");
    expect(slide.cta_link).toBe("/products/lumina-4k-camcorder");
    expect(JSON.stringify(slide)).not.toMatch(/price|stock/i);
    expect(slide.bound).toBe(true);
  });

  it("falls back to first description line when tagline is empty", () => {
    const slide = deriveProductSlide({ ...src, tagline: null });
    expect(slide.body).toBe("Long description…");
  });
});

describe("deriveBlogSlide", () => {
  const base: HeroBlogSource = {
    title: "Choosing the Right Monitor",
    slug: "choosing-right-monitor",
    excerpt: "A practical guide.",
    category: "Guides",
    image: "https://res.cloudinary.com/x/cover.jpg",
    youtubeUrl: null,
    status: "published",
  };

  it("text blog gets Read more", () => {
    const slide = deriveBlogSlide(base);
    expect(slide.cta_text).toBe("Read more");
    expect(slide.cta_link).toBe("/blog/choosing-right-monitor");
  });

  it("video blog gets Watch now but still links to the blog page (§1)", () => {
    const slide = deriveBlogSlide({ ...base, youtubeUrl: "https://youtu.be/x" });
    expect(slide.cta_text).toBe("Watch now");
    expect(slide.cta_link).toBe("/blog/choosing-right-monitor");
  });
});

describe("resolveHeroSlides", () => {
  const product = (over: Partial<HeroProductSource> = {}): HeroProductSource => ({
    name: "P",
    slug: "p",
    tagline: "t",
    description: null,
    status: "active",
    image: "i.jpg",
    categoryName: "C",
    ...over,
  });
  const blog = (over: Partial<HeroBlogSource> = {}): HeroBlogSource => ({
    title: "B",
    slug: "b",
    excerpt: "e",
    category: null,
    image: "c.jpg",
    youtubeUrl: null,
    status: "published",
    ...over,
  });

  const loaders = {
    loadProducts: async (slugs: string[]) => new Map(slugs.map((s) => [s, product({ slug: s })])),
    loadProductImage: async () => null,
    loadBlogs: async (slugs: string[]) => new Map(slugs.map((s) => [s, blog({ slug: s })])),
  };

  it("derives bound slides and passes static slides through", async () => {
    const out = await resolveHeroSlides(
      [
        { title: "Static", cta_link: "/shop", cta_text: "Browse", image: "s.jpg" },
        { title: "stale snapshot", cta_link: "/products/p" },
      ],
      loaders,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ bound: false, title: "Static", cta_link: "/shop" });
    expect(out[1]).toMatchObject({ bound: true, title: "P", cta_link: "/products/p" });
  });

  it("OMITS slides whose product source is missing or not active (§4)", async () => {
    const out = await resolveHeroSlides(
      [{ title: "gone", cta_link: "/products/missing" }],
      { ...loaders, loadProducts: async () => new Map() },
    );
    expect(out).toHaveLength(0);
    const draft = await resolveHeroSlides(
      [{ title: "draft", cta_link: "/products/p" }],
      { ...loaders, loadProducts: async () => new Map([["p", product({ status: "draft" })]]) },
    );
    expect(draft).toHaveLength(0);
  });

  it("OMITS slides whose blog source is missing or unpublished (§4)", async () => {
    const out = await resolveHeroSlides(
      [{ title: "gone", cta_link: "/blog/missing" }],
      { ...loaders, loadBlogs: async () => new Map() },
    );
    expect(out).toHaveLength(0);
    const draft = await resolveHeroSlides(
      [{ title: "draft", cta_link: "/blog/b" }],
      { ...loaders, loadBlogs: async () => new Map([["b", blog({ status: "draft" })]]) },
    );
    expect(draft).toHaveLength(0);
  });

  it("falls back to the stored snapshot fields when source fetch fails", async () => {
    const out = await resolveHeroSlides(
      [{ title: "Snapshot", body: "stored", image: "snap.jpg", cta_link: "/products/p" }],
      { ...loaders, loadProducts: async () => { throw new Error("db down"); } },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bound: true, title: "Snapshot", body: "stored", image: "snap.jpg" });
  });

  it("deduplicates identical slugs into one source query", async () => {
    let productCalls = 0;
    let received: string[] = [];
    await resolveHeroSlides(
      [
        { title: "a", cta_link: "/products/p" },
        { title: "b", cta_link: "/products/p?x=1" },
      ],
      {
        ...loaders,
        loadProducts: async (slugs) => {
          productCalls += 1;
          received = slugs;
          return loaders.loadProducts(slugs);
        },
      },
    );
    expect(productCalls).toBe(1);
    expect(received).toEqual(["p"]);
  });
});
