import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ProductCardSkeleton } from "@/components/skeletons";

/**
 * Pending-state mirror of the loaded Shop page below the header. Every region
 * of the settled page is present at its settled position — mobile category
 * strip, heading + search + sort row, mobile filters toggle, desktop sidebar
 * column, results-count bar, product grid — so hydration swaps the skeleton
 * for content without lateral or vertical layout shift. Gray blocks here are
 * geometry stand-ins only; the loaded sidebar keeps its real controls.
 */
function ShopSkeletonGrid() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <p role="status" className="sr-only">
        Loading products…
      </p>
      {/* Mobile category strip — occupies the exact sticky strip position. */}
      <section
        aria-hidden
        data-category-selector="shop-skeleton"
        className="sticky top-[4.5rem] z-30 mx-auto max-w-7xl bg-canvas/95 px-5 py-4 backdrop-blur-md sm:px-6 lg:hidden"
      >
        <div className="flex gap-3 overflow-hidden pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      </section>
      <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-6">
        {/* Heading + search + sort row (mirrors the settled flex row). */}
        <div className="flex flex-col gap-3 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-8 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 min-h-10 w-full flex-1 rounded-xl sm:w-64 sm:flex-none" />
            <Skeleton className="h-10 w-44 rounded-xl" />
          </div>
        </div>
        {/* Mobile filters toggle row. */}
        <div className="pb-4 lg:hidden">
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="flex gap-8">
          {/* Desktop sidebar column — same width/position as the settled
              filters column so the grid never shifts sideways on load. */}
          <aside aria-hidden className="hidden w-56 shrink-0 space-y-6 self-start lg:block">
            <div>
              <Skeleton className="mb-3 h-3 w-16" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-3/4" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-3 h-3 w-16" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="mt-3 h-8 w-full rounded-lg" />
            </div>
            <Skeleton className="h-5 w-24" />
          </aside>
          <div className="min-w-0 flex-1">
            {/* Results-count bar ("Showing X–Y of Z" row with its rule). */}
            <div className="mb-4 border-b border-border/60 pb-4">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { z } from "zod";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { type Product } from "@/lib/products";
import { Skeleton } from "@/components/ui/skeleton";
import { centeredCategoryScrollLeft, parseCategorySelection } from "@/lib/category-lifecycle";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";
import {
  RESILIENCE_COPY,
  createLkgCache,
  failureCopy,
  resolveSection,
} from "@/lib/public-resilience";

// Categories are now DB-driven via root loader context.
// No hardcoded category list — categories come from getPublicCategories.
// Fallback empty array if root context not yet available.

const PAGE_SIZE = 10;

/**
 * Search-schema must NEVER throw — TanStack Start SSR passes the raw
 * search-object straight through to the loader; a ZodError from
 * validateSearch leaves `search` undefined, which crashes `search.page`.
 *
 * Every field therefore normalises invalid input to a safe default
 * via .catch() / .default() so that /shop is always loadable.
 */
const searchSchema = z.object({
  category: z.string().max(500).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  sort: z.enum(["newest", "priceAsc", "priceDesc", "popular"]).default("newest").catch("newest"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export const Route = createFileRoute("/shop")({
  validateSearch: searchSchema,
  pendingComponent: () => <ShopSkeletonGrid />,
  head: () => ({
    meta: [
      { title: "Shop — Diplomat Global" },
      {
        name: "description",
        content:
          "Browse the full Diplomat Global catalog: monitors, gaming displays, cameras, computing gear and printers with Naira pricing and secure Paystack checkout.",
      },
      { property: "og:title", content: "Shop — Diplomat Global" },
      {
        property: "og:description",
        content:
          "Browse monitors, cameras, computing and printers — Naira pricing, secure checkout.",
      },
      {
        property: "og:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shop — Diplomat Global" },
      {
        name: "twitter:description",
        content:
          "Browse monitors, cameras, computing and printers — Naira pricing, secure checkout.",
      },
      {
        name: "twitter:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
    ],
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    q: search.q,
    category: search.category,
    sort: search.sort,
  }),
  loader: async ({ deps }) => {
    const page = deps.page;
    const sort = deps.sort;
    const categories = parseCategorySelection(deps.category);
    const q = deps.q;

    let products: Product[] = [];
    let total = 0;
    let totalPages = 0;
    let productsError = "";

    try {
      const { getPublicProductsPaginated } = await import("@/lib/admin/server-fns");
      const res = await getPublicProductsPaginated({
        data: { page, pageSize: PAGE_SIZE, categories, q, sort },
      });
      products = res.products ?? [];
      total = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
      productsError = "error" in res && res.error ? RESILIENCE_COPY.contentUnavailable : "";
    } catch (err) {
      console.error("[shop loader] Failed:", err);
      // Truthful failure copy: a network failure is not an empty catalogue.
      productsError = failureCopy(err);
    }

    return { products, total, page, pageSize: PAGE_SIZE, totalPages, productsError };
  },
  component: Shop,
});

type Sort = "newest" | "priceAsc" | "priceDesc" | "popular";

/**
 * Last-known-good shop pages, keyed by query. Survives client-side
 * navigations; a failed revalidation for a cached key keeps the previous
 * successful page visible (stale) instead of wiping the grid.
 */
const shopLkg = createLkgCache<{ products: Product[]; total: number; totalPages: number }>();

/** In-place retry for a failed section: one authoritative loader re-read. */
function SectionRetryButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setPending(true);
        void router.invalidate().finally(() => setPending(false));
      }}
      disabled={pending}
      className="inline-flex min-h-9 items-center rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-brand disabled:opacity-50"
    >
      {pending ? "Retrying…" : RESILIENCE_COPY.retry}
    </button>
  );
}

function Shop() {
  const { products, total, page, pageSize, totalPages, productsError } = Route.useLoaderData();
  const { category: initialCategory, q: initialQuery, sort: initialSort } = Route.useSearch();
  // Last-known-good: seed the cache from successful loads; on a failed
  // revalidation of the same query, keep serving the previous page as stale.
  const lkgKey = `page=${page}|q=${initialQuery ?? ""}|cats=${initialCategory ?? ""}|sort=${initialSort ?? ""}`;
  const cached = shopLkg.get(lkgKey);
  const effective = cached && productsError ? cached : { products, total, totalPages };
  useEffect(() => {
    if (!productsError && products.length > 0) {
      shopLkg.set(lkgKey, { products, total, totalPages });
    }
  }, [productsError, products, total, totalPages, lkgKey]);
  // A failed fetch must never masquerade as a legitimate empty catalogue.
  const section = resolveSection(effective.products, Boolean(productsError));
  const stale = section.status === "stale";
  const effectiveTotal = effective.total;
  const effectiveTotalPages = effective.totalPages;
  const navigate = Route.useNavigate();
  const rootCtx = useRootLoaderData();
  const CATEGORIES = rootCtx.categories.map((category) => ({
    slug: category.slug,
    name: category.name,
  }));

  const [activeCats, setActiveCats] = useState<string[]>(() =>
    parseCategorySelection(initialCategory),
  );
  const [query, setQuery] = useState(initialQuery ?? "");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState(1500000);
  // Compact, unambiguous naira label: 1500000 → "₦1.5M", 50000 → "₦50k".
  // Presentation only — the filter math below still uses the raw number.
  const formatMaxPrice = (value: number) =>
    value >= 1_000_000
      ? `₦${(value / 1_000_000).toLocaleString("en-NG", { maximumFractionDigits: 2 })}M`
      : `₦${Math.round(value / 1000).toLocaleString("en-NG")}k`;
  const [sort, setSort] = useState<Sort>(initialSort ?? "newest");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const categoryStripRef = useRef<HTMLDivElement>(null);

  // TanStack can reuse this component when navigation changes only search
  // parameters. Keep the selected state authoritative to the URL so a Homepage,
  // Header, or Footer category link always controls the exact Shop filter.
  useEffect(() => {
    setActiveCats(parseCategorySelection(initialCategory));
  }, [initialCategory]);

  // Auto-scroll selected category chip into view on mobile
  useEffect(() => {
    if (activeCats.length > 0 && categoryStripRef.current) {
      const container = categoryStripRef.current;
      const selectedBtn = container.querySelector<HTMLElement>('[data-selected="true"]');
      if (selectedBtn) {
        container.scrollTo({
          left: centeredCategoryScrollLeft(
            container.clientWidth,
            container.scrollWidth,
            selectedBtn.offsetLeft,
            selectedBtn.offsetWidth,
          ),
          behavior: "smooth",
        });
      }
    }
  }, [activeCats]);

  const startItem = effectiveTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, effectiveTotal);

  // Client-side filter for inStockOnly and maxPrice (not in loader since they're toggle/slider)
  const displayProducts = useMemo(() => {
    let list = [...effective.products];
    if (inStockOnly) list = list.filter((p) => p.inStock);
    list = list.filter((p) => p.price <= maxPrice);
    return list;
  }, [effective.products, inStockOnly, maxPrice]);

  // Push search params to URL (triggers loader re-run)
  const pushParams = (
    overrides: Partial<{ category: string; q: string; sort: Sort; page: number }>,
  ) => {
    const params: { category?: string; q?: string; sort?: Sort; page?: number } = {};
    const cats = overrides.category !== undefined ? overrides.category : activeCats.join(",");
    const searchTerm = overrides.q !== undefined ? overrides.q : query;
    const sortVal = overrides.sort || sort;
    const pageVal = overrides.page || 1;
    if (cats) params.category = cats;
    if (searchTerm) params.q = searchTerm;
    if (sortVal !== "newest") params.sort = sortVal;
    if (pageVal > 1) params.page = pageVal;
    navigate({ search: params, replace: true });
  };

  const toggleCategory = (slug: string) => {
    const next = activeCats.includes(slug)
      ? activeCats.filter((c) => c !== slug)
      : [...activeCats, slug];
    setActiveCats(next);
    pushParams({ category: next.join(","), page: 1 });
  };

  const clearFilters = () => {
    setActiveCats([]);
    setQuery("");
    setInStockOnly(false);
    setMaxPrice(1500000);
    setSort("newest");
    pushParams({ category: "", q: "", sort: "newest", page: 1 });
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    pushParams({ q: val, page: 1 });
  };

  const handleSort = (val: Sort) => {
    setSort(val);
    pushParams({ sort: val, page: 1 });
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      {/* Category strip — mobile only; sticks directly below the sticky header */}
      <section
        aria-label="Shop categories"
        data-category-selector="shop"
        className="sticky top-[4.5rem] z-30 mx-auto max-w-7xl bg-canvas/95 px-5 py-4 backdrop-blur-md sm:px-6 lg:hidden"
      >
        <div ref={categoryStripRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          <button
            type="button"
            data-selected={activeCats.length === 0}
            onClick={() => clearFilters()}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ring-1 transition ${
              activeCats.length === 0
                ? "bg-brand text-white ring-brand"
                : "bg-card text-muted-foreground ring-border hover:ring-brand"
            }`}
          >
            All products
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              data-selected={activeCats.includes(cat.slug)}
              onClick={() => toggleCategory(cat.slug)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ring-1 transition ${
                activeCats.includes(cat.slug)
                  ? "bg-brand text-white ring-brand"
                  : "bg-card text-muted-foreground ring-border hover:ring-brand"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-6">
        {productsError && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <span>{stale ? RESILIENCE_COPY.stale : productsError}</span>
            <SectionRetryButton />
          </div>
        )}
        {rootCtx.categoriesUnavailable && !productsError && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <span>Unable to load product categories. {RESILIENCE_COPY.unableToConnect}</span>
            <SectionRetryButton />
          </div>
        )}
        {/* Search + sort bar */}
        <div className="flex flex-col gap-3 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {activeCats.length
              ? activeCats.map((s) => CATEGORIES.find((c) => c.slug === s)?.name || s).join(" / ")
              : "All products"}
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search the catalog"
                aria-label="Search the product catalog"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                // [&::-webkit-search-cancel-button]:hidden — the native webkit
                // cancel X would duplicate the custom clear button below.
                className="min-h-10 w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/15 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => handleSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <CustomSelect
              value={sort}
              onChange={(v) => handleSort(v as Sort)}
              variant="public"
              options={[
                { value: "newest", label: "Newest" },
                { value: "popular", label: "Popularity" },
                { value: "priceAsc", label: "Price: Low to High" },
                { value: "priceDesc", label: "Price: High to Low" },
              ]}
              className="w-44"
            />
          </div>
        </div>

        {/* Mobile filter toggle + expanded panel — OUTSIDE the flex row so it never squeezes products */}
        <div className="lg:hidden pb-4">
          <button
            type="button"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"
            aria-expanded={showMobileFilters}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeCats.length > 0 && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">
                {activeCats.length}
              </span>
            )}
          </button>
          {showMobileFilters && (
            <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Price & Availability
              </h4>
              <div>
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  <label htmlFor="max-price-mobile">Max Price</label>
                </h4>
                <input
                  id="max-price-mobile"
                  type="range"
                  min={50000}
                  max={1500000}
                  step={10000}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-brand"
                />
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>₦50k</span>
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    {formatMaxPrice(maxPrice)}
                  </span>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="size-4 rounded border-border accent-brand"
                />
                <span>In stock only</span>
              </label>
              <button
                type="button"
                onClick={clearFilters}
                className="w-full text-left text-xs text-destructive font-semibold"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-8 lg:min-h-[calc(100vh-14rem)]">
          {/* Sidebar filters — desktop only.

              ROOT CAUSE (owner-visible): position:sticky is bounded by this
              row. When the result grid is SHORTER than the sidebar (e.g. the
              2-product catalogue), the row's height collapses to the sidebar
              height, sticky travel becomes zero and the sidebar scrolls away
              with the document instead of pinning. Guaranteeing the row at
              least a viewport's usable height (minus sticky header + page
              padding) restores pinned travel for ANY result count — the
              document scrolls, the grid moves, and the sidebar stays visually
              pinned through the usable results section. No clipping, no
              transform/containment traps.

              REACHABILITY (owner-visible, fixed): this used to drop to
              `static` whenever the viewport was shorter than 700px — which
              disabled pinning on ordinary laptop viewports even though the
              sidebar easily fits them (measured at 1280x650: computed
              `position: static`, sidebar scrolled off screen immediately).
              Pinning must NOT depend on viewport height. Instead the sidebar
              is capped to the space below the sticky header and scrolls
              internally when its own content is taller than that, so every
              filter stays both pinned AND reachable at any height. */}
          <aside className="hidden w-56 shrink-0 space-y-6 self-start scroll-py-2 lg:sticky lg:top-[5.5rem] lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain">
            <div>
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Category
              </h3>
              <div className="space-y-2">
                {CATEGORIES.map((cat) => (
                  <label
                    key={cat.slug}
                    className="group flex cursor-pointer items-center gap-3 text-sm"
                  >
                    <span className="relative flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface transition-all group-hover:border-brand group-focus-within:border-brand">
                      <input
                        type="checkbox"
                        checked={activeCats.includes(cat.slug)}
                        onChange={() => toggleCategory(cat.slug)}
                        className="peer sr-only"
                      />
                      <span className="size-2.5 rounded-sm bg-brand opacity-0 transition-opacity peer-checked:opacity-100" />
                    </span>
                    <span className="text-ink/80 transition group-hover:text-ink">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <label htmlFor="max-price">Max Price</label>
              </h3>
              <input
                id="max-price"
                type="range"
                min={50000}
                max={1500000}
                step={10000}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="mt-1 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
                <span className="text-muted-foreground">₦50k</span>
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  {formatMaxPrice(maxPrice)}
                </span>
              </div>
            </div>

            <div>
              <label className="group flex cursor-pointer items-center gap-3 text-sm">
                <span className="relative flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface transition-all group-hover:border-brand group-focus-within:border-brand">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="size-2.5 rounded-sm bg-brand opacity-0 transition-opacity peer-checked:opacity-100" />
                </span>
                <span className="text-ink/80 transition group-hover:text-ink">In stock only</span>
              </label>
            </div>

            {(activeCats.length > 0 || inStockOnly || maxPrice < 1500000) && (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
              >
                Clear all filters
              </button>
            )}
          </aside>

          {/* Product grid + pagination */}
          <div className="flex-1 min-w-0">
            <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-4">
              <span className="text-sm text-muted-foreground">
                {effectiveTotal > 0
                  ? `Showing ${startItem}–${endItem} of ${effectiveTotal} products`
                  : section.status === "error"
                    ? "—"
                    : "No products found"}
              </span>
            </div>

            {displayProducts.length === 0 && section.status === "error" ? (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center px-6">
                <Search className="mx-auto mb-4 size-10 text-muted-foreground/40" />
                <p className="text-lg font-semibold text-foreground">{productsError}</p>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  This is a connection problem, not an empty catalogue.
                </p>
                <div className="mt-6 flex justify-center">
                  <SectionRetryButton />
                </div>
              </div>
            ) : displayProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center px-6">
                <Search className="mx-auto mb-4 size-10 text-muted-foreground/40" />
                <p className="text-lg font-semibold text-foreground">No products found</p>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  We couldn't find anything matching your search. You can request the product you're
                  looking for and we'll get back to you.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/request"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0891b2] px-5 text-sm font-semibold text-white transition hover:bg-[#0e7490]"
                  >
                    Request this product
                  </a>
                  <a
                    href="https://wa.me/2348104056167?text=Hi%20Diplomat%20Global%2C%20I'm%20looking%20for%20a%20product"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold transition hover:border-[#25D366] hover:text-[#25D366]"
                  >
                    Chat on WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
                {displayProducts.map((p, idx) => (
                  <ProductCard key={p.id} product={p} priority={idx < 6} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Pagination">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => pushParams({ page: page - 1 })}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition hover:border-brand disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => pushParams({ page: p })}
                    className={`inline-flex size-10 items-center justify-center rounded-lg text-xs font-semibold transition ${
                      p === page
                        ? "bg-brand text-white ring-2 ring-brand/30"
                        : "border border-border bg-card hover:border-brand"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => pushParams({ page: page + 1 })}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition hover:border-brand disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </button>
              </nav>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
