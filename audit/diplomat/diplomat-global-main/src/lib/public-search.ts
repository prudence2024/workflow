// Pure, client-safe helpers for the site-wide public search.
//
// The server function (public-search.server.ts) uses these against the
// database; the header combobox uses them for grouping and rendering.
// No secrets, no server imports — safe to import from client code.

export const MIN_SEARCH_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const LIMITS = {
  products: 5,
  categories: 4,
  blog: 4,
  pages: 10, // fetched bound; entries extracted per page below
  entriesPerPage: 3,
} as const;

export type GlobalSearchType = "navigation" | "product" | "category" | "blog" | "page" | "faq";

export interface GlobalSearchResult {
  type: GlobalSearchType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  matchedField: "title" | "name" | "sku" | "slug" | "question" | "section" | "keyword";
}

export const SEARCH_GROUP_ORDER: readonly GlobalSearchType[] = [
  "navigation",
  "product",
  "category",
  "blog",
  "page",
  "faq",
];

export const SEARCH_GROUP_LABELS: Record<GlobalSearchType, string> = {
  navigation: "Navigation",
  product: "Products",
  category: "Categories",
  blog: "Blog",
  page: "Pages",
  faq: "FAQ",
};

export const SEARCH_COPY = {
  /** Definitive server-side rejection (DB misconfiguration). Never a guess. */
  serverUnavailable: "Search is temporarily unavailable. Please try again.",
  partial: "Some results couldn't be searched just now.",
} as const;

// ─── Navigation registry (real public routes only — never fabricated) ───

export const CONTACT_KEYWORDS = [
  "contact",
  "contact us",
  "phone",
  "email",
  "address",
  "location",
  "reach us",
  "customer service",
  "customer care",
  "call us",
  "support",
];

export interface NavSearchEntry {
  title: string;
  href: string;
  keywords: string[];
}

export const NAV_SEARCH_ENTRIES: NavSearchEntry[] = [
  { title: "Home", href: "/", keywords: ["home", "homepage", "start", "diplomat global"] },
  {
    title: "Shop",
    href: "/shop",
    keywords: ["shop", "store", "products", "catalogue", "catalog", "buy"],
  },
  {
    title: "Blog",
    href: "/blog",
    keywords: ["blog", "articles", "guides", "news", "tech tips"],
  },
  {
    title: "About us",
    href: "/about",
    keywords: ["about", "about us", "company", "who we are"],
  },
  {
    title: "FAQ",
    href: "/faq",
    keywords: ["faq", "faqs", "questions", "help centre", "help center", "answers"],
  },
  { title: "Contact us", href: "/contact", keywords: CONTACT_KEYWORDS },
  {
    title: "Request a product",
    href: "/request",
    keywords: ["request", "request a product", "source", "sourcing", "special order"],
  },
  {
    title: "Customer reviews",
    href: "/reviews",
    keywords: ["reviews", "testimonials", "customer reviews", "feedback"],
  },
  {
    title: "Warranty & returns",
    href: "/warranty",
    keywords: ["warranty", "returns", "refund", "return policy", "claim"],
  },
  {
    title: "Privacy policy",
    href: "/privacy-policy",
    keywords: ["privacy", "privacy policy", "data", "personal information"],
  },
  {
    title: "Terms & conditions",
    href: "/terms-and-conditions",
    keywords: ["terms", "terms and conditions", "conditions of use", "legal"],
  },
];

// ─── Query normalization ───

/** Trim, collapse internal whitespace and bound the query length. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function isSearchableQuery(raw: string): boolean {
  return normalizeQuery(raw).length >= MIN_SEARCH_LENGTH;
}

function includes(haystack: string | null | undefined, needle: string): boolean {
  return typeof haystack === "string" && haystack.toLowerCase().includes(needle);
}

/** Escape LIKE wildcards and PostgREST `or=` separators in a user query. */
export function toLikePattern(q: string): string {
  const safe = q.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  return `%${safe.replace(/([%_\\])/g, "\\$1")}%`;
}

// ─── Result builders (one per source) ───

export function matchNavEntries(q: string, entries: NavSearchEntry[]): GlobalSearchResult[] {
  const needle = q.toLowerCase();
  const results: GlobalSearchResult[] = [];
  for (const entry of entries) {
    if (entry.title.toLowerCase().includes(needle)) {
      results.push({
        type: "navigation",
        id: `nav${entry.href.replace(/\W/g, "-")}`,
        title: entry.title,
        subtitle: "Site navigation",
        href: entry.href,
        matchedField: "title",
      });
    } else if (entry.keywords.some((k) => k.includes(needle) || needle.includes(k))) {
      results.push({
        type: "navigation",
        id: `nav${entry.href.replace(/\W/g, "-")}`,
        title: entry.title,
        subtitle: "Site navigation",
        href: entry.href,
        matchedField: "keyword",
      });
    }
  }
  return results;
}

export interface ProductSearchRow {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  categories: { name: string } | null;
}

export function mapProductRows(rows: ProductSearchRow[], q: string): GlobalSearchResult[] {
  const needle = q.toLowerCase();
  return rows.map((row) => ({
    type: "product" as const,
    id: row.id,
    title: row.name,
    subtitle: `Product · ${row.sku || "no SKU"} · ${row.categories?.name || "Uncategorized"}`,
    href: `/products/${row.slug}`,
    matchedField:
      includes(row.sku, needle) && !includes(row.name, needle)
        ? ("sku" as const)
        : ("name" as const),
  }));
}

export interface CategorySearchRow {
  id: string;
  name: string;
  slug: string;
}

export function mapCategoryRows(rows: CategorySearchRow[]): GlobalSearchResult[] {
  return rows.map((row) => ({
    type: "category" as const,
    id: row.id,
    title: row.name,
    subtitle: "Product category",
    href: `/shop?category=${row.slug}`,
    matchedField: "name" as const,
  }));
}

export interface BlogSearchRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function mapBlogRows(rows: BlogSearchRow[], q: string): GlobalSearchResult[] {
  const needle = q.toLowerCase();
  return rows.map((row) => ({
    type: "blog" as const,
    id: row.id,
    title: row.title,
    subtitle: row.excerpt
      ? truncate(row.excerpt, 90)
      : `Blog article${row.category ? ` · ${row.category}` : ""}`,
    href: `/blog/${row.slug}`,
    matchedField: includes(row.title, needle) ? ("title" as const) : ("slug" as const),
  }));
}

/**
 * Extract page and FAQ entries from a published CMS page.
 *
 * Content shapes (from page-editors.tsx / page-fallbacks.server.ts):
 * - Legal pages: [{ title, paragraphs[] }, ...]
 * - About page: { heading, description, founder, faq: [{ question, answer, enabled }] }
 */
export function extractPageEntries(
  page: { id: string; slug: string; title: string; content: string | null },
  q: string,
): GlobalSearchResult[] {
  const needle = q.toLowerCase();
  const href = pageHref(page.slug);
  const entries: GlobalSearchResult[] = [];

  if (includes(page.title, needle)) {
    entries.push({
      type: "page",
      id: `page-${page.id}`,
      title: page.title,
      subtitle: "Page",
      href,
      matchedField: "title",
    });
  }

  let content: unknown;
  try {
    content = page.content ? JSON.parse(page.content) : null;
  } catch {
    content = null;
  }

  if (Array.isArray(content)) {
    for (const section of content) {
      if (entries.length >= LIMITS.entriesPerPage) break;
      if (typeof section?.title !== "string") continue;
      const paragraphs: unknown[] = Array.isArray(section.paragraphs) ? section.paragraphs : [];
      const sectionMatch =
        includes(section.title, needle) || paragraphs.some((p) => includes(p as string, needle));
      if (!sectionMatch) continue;
      entries.push({
        type: "page",
        id: `page-${page.id}-${entries.length}`,
        title: page.title,
        subtitle: section.title,
        href,
        matchedField: "section",
      });
    }
    return entries;
  }

  if (content && typeof content === "object") {
    const about = content as {
      heading?: unknown;
      description?: unknown;
      faq?: unknown;
    };
    if (
      !entries.length &&
      (includes(about.heading as string, needle) || includes(about.description as string, needle))
    ) {
      entries.push({
        type: "page",
        id: `page-${page.id}`,
        title: page.title,
        subtitle: "Page",
        href,
        matchedField: "title",
      });
    }
    if (Array.isArray(about.faq)) {
      for (const item of about.faq) {
        if (entries.length >= LIMITS.entriesPerPage) break;
        const question = (item as { question?: unknown })?.question;
        const answer = (item as { answer?: unknown })?.answer;
        const enabled = (item as { enabled?: unknown })?.enabled;
        if (enabled === false) continue; // hidden FAQ entries are not discoverable
        if (!includes(question as string, needle) && !includes(answer as string, needle)) continue;
        entries.push({
          type: "faq",
          id: `faq-${page.id}-${entries.length}`,
          title: String(question),
          subtitle: `FAQ — ${page.title}`,
          href: `${href}#faq`,
          matchedField: "question",
        });
      }
    }
  }

  return entries;
}

/** Built-in slugs keep their dedicated public routes. */
const BUILTIN_PAGE_HREFS: Record<string, string> = {
  about: "/about",
  warranty: "/warranty",
  "privacy-policy": "/privacy-policy",
  "terms-and-conditions": "/terms-and-conditions",
  faq: "/faq",
};

/**
 * Canonical public URL for a CMS page slug — the ONE mapping shared by the
 * public search index and the admin Pages list. Every non-builtin slug now
 * lands on its real page (/pages/$slug) instead of the former dead-end
 * `/about#{slug}` anchor. Origin-independent; never hostnames.
 */
export function pageHref(slug: string): string {
  return BUILTIN_PAGE_HREFS[slug] ?? `/pages/${slug}`;
}

// ─── Grouping / dedupe ───

/** Remove duplicates by destination (first occurrence wins, group order rules). */
export function dedupeResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.href)) return false;
    seen.add(r.href);
    return true;
  });
}

/** Group results by type in the canonical display order. */
export function groupSearchResults(
  results: GlobalSearchResult[],
): { type: GlobalSearchType; results: GlobalSearchResult[] }[] {
  return SEARCH_GROUP_ORDER.map((type) => ({
    type,
    results: results.filter((r) => r.type === type),
  })).filter((group) => group.results.length > 0);
}

// ─── Failure classification (truthful error semantics) ───

/**
 * Classify a failed search call. Network-class failures (fetch/abort) get the
 * Phase 4.5 connectivity copy; anything else is treated as a server-side
 * rejection, which the server fn only produces with explicit evidence.
 */
export function classifySearchFailure(err: unknown): "network" | "server" {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /failed to fetch|networkerror|load failed|aborted|abort|timeout|timed?\s?out/i.test(message)
  ) {
    return "network";
  }
  return "server";
}
