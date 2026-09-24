import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  Flame,
  Menu,
  Minus,
  Moon,
  Plus,
  Search,
  ShoppingCart,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useStore } from "@/components/store-provider";

import { formatNaira } from "@/lib/products";
import { RESILIENCE_COPY } from "@/lib/public-resilience";
import {
  SEARCH_COPY,
  SEARCH_GROUP_LABELS,
  classifySearchFailure,
  dedupeResults,
  groupSearchResults,
  normalizeQuery,
  type GlobalSearchResult,
} from "@/lib/public-search";

// Categories are DB-driven via root loader context. No hardcoded list.
import {
  DEFAULT_ANNOUNCEMENTS,
  DEFAULT_ROTATION_INTERVAL,
  dismissAnnouncement,
  getEnabledAnnouncements,
  getRotationInterval,
  isAnnouncementDismissed,
  type Announcement,
} from "@/lib/site-settings";

const iconButton =
  "relative grid size-10 place-items-center rounded-full text-ink transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const TRENDING_SEARCHES = [
  "Portable 4K",
  "Gaming monitor",
  "Camcorder",
  "USB-C hub",
  "All-in-one printer",
];

/** Stable ids for the combobox listbox (result ids are DB uuids). */
let searchSeq = 0;
function searchOptionId() {
  searchSeq += 1;
  return `header-search-option-${searchSeq}`;
}

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Products", to: "/shop" },
  { label: "Blogs", to: "/blog" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
  { label: "Request", to: "/request" },
] as const;

function navLinkClass(active: boolean) {
  return `relative rounded-md px-2.5 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-0.5 after:origin-left after:rounded-full after:bg-brand after:transition-transform after:duration-300 ${
    active
      ? "text-ink after:scale-x-100"
      : "text-muted-foreground after:scale-x-0 hover:text-ink hover:after:scale-x-100"
  }`;
}

export function SiteHeader() {
  const [query, setQuery] = useState("");
  const [staleSearch, setStaleSearch] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_ANNOUNCEMENTS);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search as Record<string, unknown>;
  const {
    cartCount,
    cartProducts,
    cartTotal,
    isDark,
    removeFromCart,
    toggleTheme,
    updateQuantity,
  } = useStore();

  const [searchResponse, setSearchResponse] = useState<{
    query: string;
    results: GlobalSearchResult[];
    partial: boolean;
    error?: string;
  }>({
    query: "",
    results: [],
    partial: false,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const [searchNonce, setSearchNonce] = useState(0);
  const searchQuery = normalizeQuery(query);
  const searchResults = searchResponse.query === searchQuery ? searchResponse.results : [];
  const searchRequestId = useRef(0);
  useEffect(() => {
    if (!searchQuery) return;
    // Race safety: a monotonic id makes older, slower responses lose to the
    // newest query regardless of completion order.
    const requestId = ++searchRequestId.current;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { globalPublicSearch } = await import("@/lib/public-search.server");
        const response = await globalPublicSearch({ data: searchQuery });
        if (cancelled || requestId !== searchRequestId.current) return;
        setSearchResponse({
          query: searchQuery,
          results: response.results,
          partial: response.partial,
          error: undefined,
        });
        setStaleSearch(false);
        setActiveOption(-1);
      } catch (err) {
        if (cancelled || requestId !== searchRequestId.current) return;
        const failure = classifySearchFailure(err);
        if (failure === "network" && searchResults.length) {
          // Last-known-good results stay visible; the stale note explains why
          // nothing newer replaced them.
          setStaleSearch(true);
          return;
        }
        setSearchResponse({
          query: searchQuery,
          results: [],
          partial: false,
          error:
            failure === "network"
              ? RESILIENCE_COPY.searchUnavailable
              : SEARCH_COPY.serverUnavailable,
        });
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // searchResults intentionally omitted: latest-wins uses the ref, not this
    // snapshot, so including it would re-run the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchNonce]);

  const onSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const optionCount = document.querySelectorAll("#header-search-listbox [role='option']").length;
    if (event.key === "ArrowDown" && optionCount > 0) {
      event.preventDefault();
      setActiveOption((i) => Math.min(i + 1, optionCount - 1));
    } else if (event.key === "ArrowUp" && optionCount > 0) {
      event.preventDefault();
      setActiveOption((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter" && activeOption >= 0) {
      event.preventDefault();
      // Options are rendered in display order; ids are indexed from 1.
      document.getElementById(`header-search-option-${activeOption + 1}`)?.click();
    }
    // Escape: Radix Dialog handles closing natively.
  };

  /** Truthful failure panel with Retry (shared by error and all-sources-failed). */
  const renderSearchError = (message: string) => (
    <div role="alert" className="px-2 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{message}</p>
      <button
        type="button"
        onClick={() => {
          searchRequestId.current += 1;
          setSearchNonce((n) => n + 1);
        }}
        className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
      >
        {RESILIENCE_COPY.retry}
      </button>
    </div>
  );

  /** Grouped, deduped result rows in canonical group order. */
  const renderGroupedResults = (results: GlobalSearchResult[]) => {
    const groups = groupSearchResults(dedupeResults(results));
    let optionIndex = 0;
    return groups.map((group) => (
      <div key={group.type} className="py-1">
        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {SEARCH_GROUP_LABELS[group.type]}
        </p>
        {group.results.map((result) => {
          optionIndex += 1;
          return (
            <Link
              key={`header-search-option-${optionIndex}`}
              to={result.href}
              id={`header-search-option-${optionIndex}`}
              role="option"
              aria-selected={optionIndex === activeOption + 1}
              data-active={optionIndex === activeOption + 1 || undefined}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none data-[active]:bg-surface"
              onClick={() => {
                setSearchOpen(false);
                setStaleSearch(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {result.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {result.subtitle}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SEARCH_GROUP_LABELS[result.type]}
              </span>
            </Link>
          );
        })}
      </div>
    ));
  };

  // DB-driven categories from root loader (pre-fetched on every navigation)
  const rootData = useRootLoaderData();
  const dbCategories = rootData.categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
  }));

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to.replace(/\/$/, ""));
  const isProductsActive = pathname === "/shop" && !search.category;
  const isCategoriesActive = pathname === "/shop" && Boolean(search.category);
  // Shop renders its own single swipeable category selector. Keep this compact
  // strip only on product-detail pages to avoid duplicate mobile controls.
  const isCommercePage = pathname.startsWith("/products/");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Use root loader data (pre-fetched on every navigation) instead of a separate serverFn call.
  // This eliminates one extra server round-trip per page load.
  const rootSiteSettings = rootData.siteSettings;

  const [rotationInterval, setRotationInterval] = useState(DEFAULT_ROTATION_INTERVAL);

  useEffect(() => {
    setAnnouncementDismissed(isAnnouncementDismissed());
    // Initialize from root loader data (available immediately from SSR)
    const dbAnnouncements = rootSiteSettings.announcements;
    const enabled = getEnabledAnnouncements(dbAnnouncements);
    if (enabled.length > 0) setAnnouncements(enabled);
    else {
      const fallback = getEnabledAnnouncements();
      if (fallback.length > 0) setAnnouncements(fallback);
    }
    const interval = getRotationInterval(rootSiteSettings);
    setRotationInterval(interval);
  }, [rootSiteSettings]);

  // Rotate enabled announcements at configured interval
  useEffect(() => {
    if (announcementDismissed || announcements.length <= 1) return;
    // Respect prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => {
      setAnnouncementIndex((prev) => (prev + 1) % announcements.length);
    }, rotationInterval);
    return () => clearInterval(timer);
  }, [announcementDismissed, announcements.length, rotationInterval]);

  return (
    <>
      {!announcementDismissed && (
        <div className="relative overflow-hidden bg-inverse px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-inverse-foreground/75">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-inverse-foreground/10 to-transparent" />
          <span className="mx-auto block max-w-[calc(100%-3.5rem)] truncate sm:max-w-none">
            {announcements[announcementIndex]?.text || announcements[0]?.text || ""}
          </span>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => {
              dismissAnnouncement();
              setAnnouncementDismissed(true);
            }}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-inverse-foreground/60 transition hover:bg-inverse-foreground/10 hover:text-inverse-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <header
        className={`sticky top-0 z-40 border-b bg-canvas/90 backdrop-blur-xl transition-shadow duration-300 ${scrolled ? "border-border shadow-[0_8px_30px_-12px_rgb(0_0_0/0.12)]" : "border-border/70"}`}
      >
        <div className="relative mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-5 sm:px-6">
          <div className="flex shrink-0 items-center">
            <Link
              to="/"
              aria-label="Diplomat Global — home"
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {/* Visible "Diplomat Global" wordmark is inside BrandLogo; the
                  accessible name includes that visible text (axe link-name). */}
              <BrandLogo compactOnMobile />
              <span className="sr-only">— home</span>
            </Link>
          </div>

          <nav
            aria-label="Primary navigation"
            className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-1 lg:flex"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                preload="intent"
                className={navLinkClass(item.to === "/shop" ? isProductsActive : isActive(item.to))}
              >
                {item.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`${navLinkClass(isCategoriesActive)} inline-flex items-center gap-1`}
                  aria-haspopup="menu"
                >
                  Categories
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                <DropdownMenuItem asChild>
                  <Link to="/shop" search={{}} preload="intent" className="font-medium">
                    All categories
                  </Link>
                </DropdownMenuItem>
                {dbCategories.map((cat) => (
                  <DropdownMenuItem key={cat.slug} asChild>
                    <Link to="/shop" search={{ category: cat.slug }} preload="intent">
                      {cat.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          <div className="ml-auto flex items-center justify-end gap-1">
            <Dialog
              open={searchOpen}
              onOpenChange={(open) => {
                setSearchOpen(open);
                if (!open) {
                  setStaleSearch(false);
                  setActiveOption(-1);
                }
              }}
            >
              <DialogTrigger asChild onClick={() => setSearchOpen(true)}>
                <button type="button" aria-label="Search products" className={iconButton}>
                  <Search className="size-[18px]" />
                </button>
              </DialogTrigger>
              <DialogContent
                className="w-[calc(100%-2rem)] overflow-hidden border-border bg-canvas p-0 sm:max-w-xl"
                hideClose
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>Search products</DialogTitle>
                  <DialogDescription>Search the Diplomat Global catalog.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <Search className="size-5 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (staleSearch) setStaleSearch(false);
                      setActiveOption(-1);
                    }}
                    onKeyDown={onSearchInputKeyDown}
                    placeholder="Search products, blog, pages…"
                    autoFocus
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="header-search-listbox"
                    aria-autocomplete="list"
                    aria-label="Search the site"
                    className="h-10 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
                  />
                  {query.trim() && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("");
                        setStaleSearch(false);
                      }}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                  <DialogClose asChild>
                    <button
                      type="button"
                      aria-label="Close search"
                      className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </DialogClose>
                </div>
                <div
                  id="header-search-listbox"
                  role="listbox"
                  aria-label="Search results"
                  className="max-h-[60vh] overflow-y-auto p-3"
                >
                  {!query.trim() ? (
                    <div className="px-2 py-6">
                      <div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        <Flame className="size-3.5 text-brand" />
                        Trending now
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 px-2">
                        {TRENDING_SEARCHES.map((term) => (
                          <button
                            key={term}
                            type="button"
                            onClick={() => setQuery(term)}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-brand hover:bg-brand/5 hover:text-brand"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : searchResponse.error ? (
                    renderSearchError(searchResponse.error)
                  ) : searchResponse.query !== searchQuery ? (
                    <p role="status" className="p-4 text-sm">
                      Searching the site…
                    </p>
                  ) : searchResponse.partial && searchResults.length ? (
                    // Partial success: usable results exist but at least one
                    // public source failed. Show them plus the truthful note.
                    <div>
                      <p
                        role="status"
                        className="mx-2 mb-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground"
                      >
                        {SEARCH_COPY.partial}
                      </p>
                      {renderGroupedResults(searchResults)}
                    </div>
                  ) : staleSearch && searchResults.length ? (
                    <div>
                      <p
                        role="status"
                        className="mx-2 mb-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground"
                      >
                        {RESILIENCE_COPY.stale}
                      </p>
                      {renderGroupedResults(searchResults)}
                    </div>
                  ) : searchResults.length ? (
                    renderGroupedResults(searchResults)
                  ) : searchResponse.partial ? (
                    // Every public source failed on this fresh query — a real
                    // failure, not an empty result set.
                    renderSearchError(SEARCH_COPY.serverUnavailable)
                  ) : (
                    <div className="px-2 py-8 text-center">
                      <p className="text-sm font-semibold text-ink">
                        No results found for “{searchQuery}”.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Can't find what you're looking for?
                      </p>
                      <Link
                        to="/request"
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0891b2] px-4 text-xs font-semibold text-white transition hover:bg-[#0e7490]"
                      >
                        Request this product
                      </Link>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className={`${iconButton} hidden sm:grid`}
            >
              {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>

            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={`Cart with ${cartCount} items`}
                  className={iconButton}
                >
                  <ShoppingCart className="size-[18px]" />
                  {cartCount > 0 && (
                    <span
                      key={cartCount}
                      className="animate-pop-in absolute ml-6 -mt-6 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold tabular-nums text-brand-foreground"
                    >
                      {cartCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col border-border bg-canvas p-0 sm:max-w-md">
                <SheetHeader className="border-b border-border px-6 py-6 pr-12 text-left">
                  <SheetTitle className="font-display text-xl">Your cart</SheetTitle>
                  <SheetDescription>
                    {cartCount
                      ? `${cartCount} item${cartCount === 1 ? "" : "s"} selected`
                      : "Ready when you are."}
                  </SheetDescription>
                </SheetHeader>
                {cartProducts.length ? (
                  <>
                    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                      {cartProducts.map(({ product, quantity }) => (
                        <div key={product.id} className="flex gap-4">
                          <img
                            src={product.image}
                            alt=""
                            className="size-20 rounded-xl bg-surface object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
                              {product.name}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-brand">
                              {formatNaira(product.price)}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <div className="flex items-center rounded-lg border border-border">
                                <button
                                  type="button"
                                  aria-label={`Decrease ${product.name} quantity`}
                                  onClick={() => updateQuantity(product.id, quantity - 1)}
                                  className="grid size-8 place-items-center text-ink hover:text-brand"
                                >
                                  <Minus className="size-3" />
                                </button>
                                <span className="w-7 text-center text-xs font-semibold">
                                  {quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Increase ${product.name} quantity`}
                                  onClick={() => updateQuantity(product.id, quantity + 1)}
                                  className="grid size-8 place-items-center text-ink hover:text-brand"
                                >
                                  <Plus className="size-3" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFromCart(product.id)}
                                aria-label={`Remove ${product.name} from cart`}
                                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-border bg-surface/60 p-6">
                      <div className="mb-5 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Subtotal</span>
                        <span className="font-display text-xl font-semibold">
                          {formatNaira(cartTotal)}
                        </span>
                      </div>
                      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                        Delivery and promo codes are calculated during checkout.
                      </p>
                      <Link
                        to="/checkout"
                        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground"
                      >
                        Continue to checkout
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center px-8 text-center">
                    <div>
                      <span className="mx-auto grid size-16 place-items-center rounded-full bg-surface text-muted-foreground">
                        <ShoppingCart className="size-6" />
                      </span>
                      <p className="mt-5 font-display text-lg font-semibold text-ink">
                        Your cart is empty
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Explore dependable tech selected for work, play and creativity.
                      </p>
                      <SheetClose asChild>
                        <Link
                          to="/shop"
                          search={{}}
                          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground"
                        >
                          Browse products
                        </Link>
                      </SheetClose>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className={`${iconButton} lg:hidden`}
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[88%] border-border bg-canvas sm:max-w-sm overflow-y-auto"
              >
                <SheetHeader className="text-left">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">Browse Diplomat Global.</SheetDescription>
                  <BrandLogo />
                </SheetHeader>
                <nav className="mt-10 flex flex-col" aria-label="Mobile navigation">
                  {NAV_ITEMS.map((item) => (
                    <SheetClose asChild key={item.label}>
                      <Link
                        to={item.to}
                        preload="intent"
                        className={`border-b border-border py-4 font-display text-xl font-semibold ${
                          isActive(item.to) ? "text-brand" : ""
                        }`}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                  <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Categories
                  </p>
                  {dbCategories.map((cat) => (
                    <SheetClose asChild key={cat.slug}>
                      <Link
                        to="/shop"
                        search={{ category: cat.slug }}
                        className="border-b border-border py-4 font-display text-xl font-semibold"
                      >
                        {cat.name}
                      </Link>
                    </SheetClose>
                  ))}
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="mt-6 flex min-h-11 items-center gap-3 rounded-xl bg-surface px-4 text-left text-sm font-semibold"
                  >
                    {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    Use {isDark ? "light" : "dark"} mode
                  </button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {isCommercePage && (
        <div className="border-b border-border/60 bg-inverse text-inverse-foreground md:hidden">
          <nav
            aria-label="Product categories"
            className="scrollbar-hide mx-auto flex max-w-7xl gap-7 overflow-x-auto whitespace-nowrap px-5 py-3 sm:px-6"
          >
            {dbCategories.map((cat) => (
              <Link
                key={cat.slug}
                to="/shop"
                search={{ category: cat.slug }}
                preload="intent"
                className={`text-[10px] font-semibold uppercase tracking-[0.17em] transition-colors hover:text-brand ${
                  isCategoriesActive && search.category === cat.slug
                    ? "text-brand"
                    : "text-inverse-foreground/65"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
