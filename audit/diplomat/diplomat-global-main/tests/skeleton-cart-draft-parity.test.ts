import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("skeleton structural parity (OWNER_RUNTIME_DEFECT=SKELETON_CONTENT_MISMATCH)", () => {
  it("product-card skeleton mirrors the real card media ratio at both breakpoints", () => {
    const real = read("src/components/product-card.tsx");
    const sk = read("src/components/skeletons.tsx");
    // Real media: aspect-[4/3] sm:aspect-square
    expect(real).toContain("aspect-[4/3] sm:aspect-square");
    expect(sk).toContain("aspect-[4/3] w-full rounded-none sm:aspect-square");
  });

  it("product-card skeleton reserves the exact 2-line title area of the real card", () => {
    const real = read("src/components/product-card.tsx");
    const sk = read("src/components/skeletons.tsx");
    expect(real).toContain("line-clamp-2 min-h-[2.5rem]");
    expect(real).toContain("min-[400px]:min-h-10");
    expect(sk).toContain("min-h-[2.5rem] space-y-1.5 min-[400px]:min-h-10");
  });

  it("blog-card skeleton mirrors the real 16/10 media and 3-line excerpt area", () => {
    const real = read("src/routes/blog.index.tsx");
    const sk = read("src/components/skeletons.tsx");
    expect(real).toContain("aspect-[16/10]");
    expect(real).toContain("line-clamp-3 text-sm");
    expect(sk).toContain("aspect-[16/10] w-full rounded-none");
    expect(sk).toContain("min-h-[3.75rem]");
  });

  it("shop category sidebar renders real category controls, never product-card skeletons", () => {
    const shop = read("src/routes/shop.tsx");
    const loadedAsideStart = shop.indexOf("Sidebar filters");
    const aside = shop.slice(loadedAsideStart, shop.indexOf("</aside>", loadedAsideStart));
    expect(aside).toContain("CATEGORIES.map");
    expect(aside).not.toContain("Skeleton");
    // Owner requirement: pinned to the viewport while the page scrolls, at EVERY
    // viewport height, and every category still reachable.
    //
    // The previous contract here required a `max-height:700px` fallback that
    // flipped the sidebar to `!static`. That fallback WAS the owner-reported
    // defect: measured live at 1280x650 (an ordinary laptop viewport) the
    // sidebar computed `position: static` and scrolled off screen immediately
    // (top 186 -> -114 -> -677), even though the sidebar is only ~317px tall and
    // fits that viewport comfortably. Pinning therefore must never be
    // conditional on viewport height.
    expect(aside).toContain("lg:sticky");
    expect(aside).toContain("lg:top-[5.5rem]");
    expect(aside).not.toContain("max-height:700px");
    expect(aside).not.toContain("!static");
    // Reachability instead comes from a viewport-relative cap plus internal
    // scrolling, which only renders a scrollbar when the content genuinely
    // exceeds the space below the sticky header.
    expect(aside).toContain("lg:max-h-[calc(100dvh-6.5rem)]");
    expect(aside).toContain("lg:overflow-y-auto");
  });

  it("pending grid keeps sticky travel even when results are shorter than the sidebar", () => {
    // ROOT CAUSE pin: with a 2-product grid, the flex row collapses to the
    // sidebar height and sticky travel becomes zero — the owner-visible
    // "sidebar scrolls away" defect. The row must guarantee at least a
    // viewport of usable height on desktop.
    const shop = read("src/routes/shop.tsx");
    expect(shop).toContain("flex gap-8 lg:min-h-[calc(100vh-14rem)]");
  });

  it("shop pending skeleton mirrors every settled page region (no lateral CLS)", () => {
    const shop = read("src/routes/shop.tsx");
    const skeleton = shop.slice(
      shop.indexOf("function ShopSkeletonGrid"),
      shop.indexOf("type Sort"),
    );
    // Same mobile category-strip position classes as the settled strip
    expect(skeleton).toContain(
      "sticky top-[4.5rem] z-30 mx-auto max-w-7xl bg-canvas/95 px-5 py-4 backdrop-blur-md sm:px-6 lg:hidden",
    );
    // Same main container + heading/search/sort row + mobile filters row
    expect(skeleton).toContain("mx-auto max-w-7xl px-5 pb-20 sm:px-6");
    expect(skeleton).toContain(
      "flex flex-col gap-3 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between",
    );
    expect(skeleton).toContain("pb-4 lg:hidden");
    // Desktop sidebar column exists with the exact settled width classes
    expect(skeleton).toContain("hidden w-56 shrink-0 space-y-6 self-start lg:block");
    // Results-count bar mirrored (border-b row)
    expect(skeleton).toContain("mb-4 border-b border-border/60 pb-4");
    // Same grid classes as the settled grid
    expect(skeleton).toContain("grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3");
  });

  it("no skeleton file reintroduces a generic category placeholder", () => {
    const sk = read("src/components/skeletons.tsx");
    expect(sk).not.toMatch(/CategorySkeleton/);
  });
});

describe("cart clear authority (OWNER P0 #2 regression pin)", () => {
  const routes = ["src/routes/checkout_.callback.tsx", "src/routes/order-success.tsx"];

  it("payment-success routes use the canonical store action, never raw localStorage removal", () => {
    for (const route of routes) {
      const src = read(route);
      expect(src, route).not.toContain('localStorage.removeItem("dg-cart")');
      expect(src, route).not.toContain("localStorage.removeItem('dg-cart')");
      expect(src, route).toMatch(/clearCart\(\)/);
    }
  });

  it("StoreProvider is the single storage authority (one hydration cleanup removal, persisted via state)", () => {
    const store = read("src/components/store-provider.tsx");
    expect(store).toMatch(/clearCart/);
    // Exactly one removeItem: the hydration-time corrupt-cart cleanup inside StoreProvider.
    const removals = store.match(/localStorage\.removeItem\("dg-cart"\)/g) ?? [];
    expect(removals).toHaveLength(1);
    // The persist effect must write from React state, never read ad-hoc elsewhere.
    expect(store).toContain("serializeStoredCart(cart)");
  });
});

describe("checkout draft safety (OWNER requirement #3 regression pin)", () => {
  it("draft uses sessionStorage with an explicit allowlist and no sensitive fields", () => {
    const draft = read("src/lib/checkout-draft.ts");
    expect(draft).toContain("sessionStorage");
    expect(draft).not.toContain("localStorage");
    // Sensitive identifiers must never appear as persisted keys
    for (const banned of [
      "cvv",
      "pin",
      "otp",
      "password",
      "card",
      "token",
      "authorization",
      "secret",
    ]) {
      expect(draft.toLowerCase(), banned).not.toMatch(new RegExp(`["']${banned}["']`));
    }
  });
});
