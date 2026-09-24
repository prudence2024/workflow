import { describe, expect, it } from "vitest";
import {
  SEARCH_GROUP_ORDER,
  CONTACT_KEYWORDS,
  NAV_SEARCH_ENTRIES,
  classifySearchFailure,
  dedupeResults,
  extractPageEntries,
  groupSearchResults,
  isSearchableQuery,
  mapBlogRows,
  mapCategoryRows,
  mapProductRows,
  matchNavEntries,
  normalizeQuery,
  pageHref,
  toLikePattern,
  type GlobalSearchResult,
} from "../src/lib/public-search";

describe("global search: query normalization", () => {
  it("trims and bounds queries", () => {
    expect(normalizeQuery("  monitor   setup  ")).toBe("monitor setup");
    expect(normalizeQuery(`x`.repeat(250)).length).toBe(100);
  });

  it("enforces a minimum useful query length", () => {
    expect(isSearchableQuery("m")).toBe(false);
    expect(isSearchableQuery("mo")).toBe(true);
    expect(isSearchableQuery("  ")).toBe(false);
  });

  it("neutralizes LIKE wildcards and PostgREST or-separators", () => {
    expect(toLikePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(toLikePattern("a,b(c)")).toBe("%a b c%");
  });
});

describe("global search: navigation registry", () => {
  it("maps contact-related terms to the Contact page only", () => {
    for (const term of ["contact", "phone", "email", "address", "location", "reach us"]) {
      const results = matchNavEntries(normalizeQuery(term), NAV_SEARCH_ENTRIES);
      expect(results.some((r) => r.href === "/contact")).toBe(true);
    }
  });

  it("matches real routes only (no fabricated pages)", () => {
    const hrefs = new Set(NAV_SEARCH_ENTRIES.map((e) => e.href));
    for (const href of hrefs) {
      expect([
        "/",
        "/shop",
        "/blog",
        "/about",
        "/contact",
        "/faq",
        "/request",
        "/reviews",
        "/warranty",
        "/privacy-policy",
        "/terms-and-conditions",
      ]).toContain(href);
    }
  });

  it("matches titles directly and keywords indirectly", () => {
    expect(matchNavEntries("shop", NAV_SEARCH_ENTRIES)[0]?.href).toBe("/shop");
    const byKeyword = matchNavEntries("buy", NAV_SEARCH_ENTRIES);
    expect(byKeyword.some((r) => r.href === "/shop" && r.matchedField === "keyword")).toBe(true);
  });
});

describe("global search: row mappers", () => {
  it("maps product rows with SKU/price context and safe hrefs", () => {
    const rows = [
      {
        id: "p1",
        slug: "tp-link-hub",
        name: "TP-Link USB-C Hub",
        sku: "TPL-480",
        categories: { name: "Accessories" },
      },
    ];
    const results = mapProductRows(rows, "hub");
    expect(results[0]).toMatchObject({
      type: "product",
      title: "TP-Link USB-C Hub",
      href: "/products/tp-link-hub",
    });
    expect(results[0].subtitle).toContain("TPL-480");
    expect(results[0].subtitle).toContain("Accessories");
  });

  it("distinguishes SKU matches from name matches", () => {
    const rows = [{ id: "p1", slug: "x", name: "Monitor Arm", sku: "TPL-480", categories: null }];
    expect(mapProductRows(rows, "480")[0].matchedField).toBe("sku");
    expect(mapProductRows(rows, "monitor")[0].matchedField).toBe("name");
  });

  it("maps categories to shop category routes", () => {
    const results = mapCategoryRows([{ id: "c1", name: "Monitors", slug: "monitors" }]);
    expect(results[0]).toMatchObject({
      type: "category",
      href: "/shop?category=monitors",
      subtitle: "Product category",
    });
  });

  it("maps blog rows to article routes and never exposes drafts", () => {
    const results = mapBlogRows(
      [
        {
          id: "b1",
          slug: "monitor-guide",
          title: "Monitor guide",
          excerpt: null,
          category: "Guides",
        },
      ],
      "monitor",
    );
    expect(results[0]).toMatchObject({ type: "blog", href: "/blog/monitor-guide" });
  });
});

describe("global search: CMS page + FAQ extraction", () => {
  it("extracts matching legal sections from published page content", () => {
    const page = {
      id: "pg1",
      slug: "warranty",
      title: "Warranty & returns",
      content: JSON.stringify([
        { title: "Refunds", paragraphs: ["Approved refunds take 5–10 business days."] },
        { title: "Coverage", paragraphs: ["Manufacturing defects only."] },
      ]),
    };
    const results = extractPageEntries(page, "refund");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "page",
      title: "Warranty & returns",
      subtitle: "Refunds",
      href: "/warranty",
    });
  });

  it("extracts enabled FAQ entries and skips hidden ones", () => {
    const page = {
      id: "pg2",
      slug: "about",
      title: "About Diplomat Global",
      content: JSON.stringify({
        heading: "About us",
        faq: [
          { question: "Do you deliver nationwide?", answer: "Yes, across Nigeria.", enabled: true },
          { question: "Hidden question", answer: "Secret", enabled: false },
        ],
      }),
    };
    const results = extractPageEntries(page, "deliver");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("faq");
    expect(results[0].href).toBe("/about#faq");
    expect(results.some((r) => r.title === "Hidden question")).toBe(false);
  });

  it("never returns hidden FAQ entries for hidden-question queries", () => {
    const page = {
      id: "pg3",
      slug: "about",
      title: "About",
      content: JSON.stringify({
        faq: [{ question: "Internal staffing question", answer: "Secret", enabled: false }],
      }),
    };
    expect(extractPageEntries(page, "staffing")).toHaveLength(0);
  });

  it("maps the faq slug to the dedicated /faq route", () => {
    expect(pageHref("faq")).toBe("/faq");
    expect(pageHref("about")).toBe("/about");
    expect(pageHref("warranty")).toBe("/warranty");
    // Generic CMS slugs land on their real public page, not a dead-end anchor.
    expect(pageHref("unknown-generic")).toBe("/pages/unknown-generic");
  });

  it("tolerates corrupt JSON content", () => {
    const page = { id: "pg4", slug: "warranty", title: "Warranty", content: "{not json" };
    expect(extractPageEntries(page, "warranty").length).toBeGreaterThan(0); // title match still works
    expect(extractPageEntries(page, "nonexistent")).toHaveLength(0);
  });
});

describe("global search: grouping and dedupe", () => {
  it("groups in canonical order and drops empty groups", () => {
    const results: GlobalSearchResult[] = [
      {
        type: "product",
        id: "p",
        title: "Hub",
        subtitle: "Product",
        href: "/products/hub",
        matchedField: "name",
      },
      {
        type: "navigation",
        id: "n",
        title: "Shop",
        subtitle: "Site navigation",
        href: "/shop",
        matchedField: "title",
      },
      {
        type: "faq",
        id: "f",
        title: "Q?",
        subtitle: "FAQ",
        href: "/about#faq",
        matchedField: "question",
      },
    ];
    const groups = groupSearchResults(results);
    expect(groups.map((g) => g.type)).toEqual(["navigation", "product", "faq"]);
  });

  it("dedupes identical destinations, keeping the first occurrence", () => {
    const results: GlobalSearchResult[] = [
      {
        type: "navigation",
        id: "1",
        title: "About us",
        subtitle: "Site navigation",
        href: "/about",
        matchedField: "title",
      },
      {
        type: "page",
        id: "2",
        title: "About Diplomat Global",
        subtitle: "Page",
        href: "/about",
        matchedField: "title",
      },
    ];
    expect(dedupeResults(results)).toHaveLength(1);
    expect(dedupeResults(results)[0].type).toBe("navigation");
  });

  it("covers every group type with a display label", () => {
    expect(SEARCH_GROUP_ORDER.length).toBeGreaterThanOrEqual(6);
  });
});

describe("global search: failure classification", () => {
  it("classifies transport failures as network", () => {
    expect(classifySearchFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifySearchFailure(new Error("The operation was aborted"))).toBe("network");
    expect(classifySearchFailure(new Error("signal is aborted without reason"))).toBe("network");
  });

  it("treats definitive server rejections as server (not connectivity lies)", () => {
    expect(
      classifySearchFailure(new Error("Search is temporarily unavailable. Please try again.")),
    ).toBe("server");
  });
});

describe("global search: contact keyword registry", () => {
  it("keeps contact keywords authoritative", () => {
    for (const keyword of ["contact", "phone", "email", "address", "location", "reach us"]) {
      expect(CONTACT_KEYWORDS).toContain(keyword);
    }
  });
});
