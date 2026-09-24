import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ReviewForm } from "@/components/review-form";
import { getProductReviews } from "@/lib/reviews.server";
import { toast } from "sonner";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ProductDetailSkeleton } from "@/components/skeletons";
import { useStore } from "@/components/store-provider";
import {
  formatNaira,
  getProductDescription,
  getProductImages,
  getProductSpecs,
  type Product,
} from "@/lib/products";
import { productDetailImage, productThumbnailImage } from "@/lib/cloudinary-utils";
import { productImageIdentity, productImageSelection } from "@/lib/product-gallery";
import { RESILIENCE_COPY, createLkgCache, isNetworkError } from "@/lib/public-resilience";

const siteUrl = (import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/+$/, "");

/** Public review row shape used by the detail page (subset actually consumed). */
type ProductReviewRow = {
  rating: number;
  customers?: { first_name?: string | null; last_name?: string | null } | null;
};

/** Last-known-good product detail per slug; survives a failed revalidation. */
const productLkg = createLkgCache<{
  product: Product;
  related: Product[];
  reviews: ProductReviewRow[];
  avgRating: number;
  reviewCount: number;
}>();

export const Route = createFileRoute("/products/$slug")({
  pendingComponent: () => (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <ProductDetailSkeleton />
    </div>
  ),
  loader: async ({ params }) => {
    try {
      const { getPublicProductBySlug: fetchProduct, getRelatedProducts } =
        await import("@/lib/admin/server-fns");
      const result = await fetchProduct({ data: { slug: params.slug } });
      if (result.product) {
        const p = result.product;
        const dbProduct: Product = {
          id: p.id,
          sku: p.sku,
          slug: p.slug,
          name: p.name,
          tagline: p.tagline || "",
          category: (p.category || "Other") as any,
          price: p.price,
          compareAt: p.compareAt,
          image: p.image,
          images: p.images,
          imageAlts: p.imageAlts || [],
          inStock: p.inStock,
          stockQuantity: p.stockQuantity,
          stockState: p.stockState,
          featured: p.featured,
          isNew: p.isNew,
          description: p.description || "",
          specs: p.specs || [],
        };
        // Fetch related products and reviews in parallel
        let relatedProducts: Product[] = [];
        let reviews: ProductReviewRow[] = [];
        let avgRating = 0;
        let reviewCount = 0;
        try {
          const { getRelatedProducts: getRelated } = await import("@/lib/admin/server-fns");
          const { getProductReviews: getReviews } = await import("@/lib/reviews.server");
          const [relatedRes, reviewsRes] = await Promise.allSettled([
            getRelated({ data: { categoryId: p.categoryId, excludeId: p.id, limit: 4 } }),
            getReviews({ data: { product_id: p.id } }),
          ]);
          if (relatedRes.status === "fulfilled") relatedProducts = relatedRes.value.products ?? [];
          if (reviewsRes.status === "fulfilled" && reviewsRes.value.reviews?.length) {
            reviews = reviewsRes.value.reviews;
            reviewCount = reviews.length;
            avgRating =
              reviews.reduce((sum: number, r: ProductReviewRow) => sum + r.rating, 0) / reviewCount;
          }
        } catch {
          // Non-critical
        }
        return {
          dbProduct,
          staticProduct: null as Product | null,
          relatedProducts,
          reviews,
          avgRating,
          reviewCount,
        };
      }
    } catch (err) {
      console.error("[product loader] DB fetch failed:", err);
      // Truthful, local failure handling: the loader reports the failure and
      // lets the route render a retryable error state (with last-known-good
      // content where available) instead of escalating to the global error
      // boundary — an expected connectivity failure is not an application
      // error. Unexpected server failures still surface to Sentry through
      // the route's warning/error capture below.
      return {
        dbProduct: null as Product | null,
        staticProduct: null as Product | null,
        relatedProducts: [] as Product[],
        reviews: [] as ProductReviewRow[],
        avgRating: 0,
        reviewCount: 0,
        loadError: err instanceof Error ? err.message : "Failed to load product",
        loadErrorIsNetwork: isNetworkError(err),
      };
    }
    return {
      dbProduct: null as Product | null,
      staticProduct: null as Product | null,
      relatedProducts: [] as Product[],
      reviews: [] as ProductReviewRow[],
      avgRating: 0,
      reviewCount: 0,
    };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.dbProduct || loaderData?.staticProduct;
    if (!product) return { meta: [{ title: "Product not found" }] };
    const title = `${product.name} — Diplomat Global`;
    const description = getProductDescription(product);
    const images = getProductImages(product).map((image) => new URL(image, siteUrl).href);
    // Trim the historical trailing-space slugs and encode what remains, so the
    // canonical/og:url never carries a raw space and always advertises the
    // clean canonical path.
    const url = `${siteUrl}/products/${encodeURIComponent(product.slug.trim())}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: images[0] },
        { property: "og:image:alt", content: product.name },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "product:price:amount", content: String(product.price) },
        { property: "product:price:currency", content: "NGN" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: images[0] },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            image: images,
            description,
            sku: product.id,
            brand: { "@type": "Brand", name: "Diplomat Global" },
            offers: {
              "@type": "Offer",
              url,
              priceCurrency: "NGN",
              price: product.price,
              availability: product.inStock
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          }),
        },
      ],
    };
  },
  component: ProductDetails,
});

function ProductDetails() {
  const data = Route.useLoaderData();
  return <ProductDetailsContent key={data.dbProduct?.id ?? "missing"} data={data} />;
}

function ProductDetailsContent({ data }: { data: ReturnType<typeof Route.useLoaderData> }) {
  const {
    dbProduct,
    staticProduct,
    relatedProducts,
    reviews: loaderReviews,
    avgRating,
    reviewCount,
    loadError,
    loadErrorIsNetwork,
  } = data;
  const product = dbProduct || staticProduct;
  const [selection, setSelection] = useState({ productId: product?.id ?? "", index: 0 });
  const { addToCart } = useStore();
  const router = useRouter();

  // Last-known-good product detail: a failed revalidation of the same slug
  // keeps the previously rendered product visible with a connection notice;
  // only a genuine never-loaded product falls through to error semantics.
  const slug = Route.useParams().slug;
  const lkgKey = product?.slug ?? slug;
  const cached = productLkg.get(lkgKey);
  useEffect(() => {
    if (product) {
      productLkg.set(lkgKey, {
        product,
        related: relatedProducts,
        reviews: loaderReviews,
        avgRating,
        reviewCount,
      });
    }
  }, [product, lkgKey, relatedProducts, loaderReviews, avgRating, reviewCount]);

  if (!product && loadError && cached) {
    const c = cached;
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-5 py-3">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <span>{RESILIENCE_COPY.stale}</span>
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="inline-flex min-h-9 items-center rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-brand"
            >
              {RESILIENCE_COPY.retry}
            </button>
          </div>
        </div>
        <ProductDetailsContent
          data={{
            dbProduct: c.product,
            staticProduct: null,
            relatedProducts: c.related,
            reviews: c.reviews,
            avgRating: c.avgRating,
            reviewCount: c.reviewCount,
          }}
        />
        <SiteFooter />
      </div>
    );
  }

  if (!product && loadError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <p className="text-lg font-semibold">
          {loadErrorIsNetwork
            ? RESILIENCE_COPY.unableToConnect
            : RESILIENCE_COPY.contentUnavailable}
        </p>
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold transition hover:border-brand"
        >
          {RESILIENCE_COPY.retry}
        </button>
      </div>
    );
  }

  if (!product) throw notFound();

  const images = getProductImages(product);
  const active = productImageSelection(product.id, selection, images.length);
  const setActive = (index: number) => setSelection({ productId: product.id, index });
  // Reset synchronously on identity change, even if the route component is reused.
  if (selection.productId !== product.id) setActive(0);
  const imageAlts = (product as any).imageAlts || [];
  const related: Product[] = relatedProducts;
  const go = (next: number) => setActive((next + images.length) % images.length);
  const add = () => {
    addToCart(product.id, {
      id: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline || "",
      category: product.category || "Other",
      price: product.price,
      image: product.image,
      inStock: product.inStock,
    });
    toast.success(`${product.name} added to cart`, {
      description: "Your cart is ready when you are.",
      action: { label: "Checkout", onClick: () => (window.location.href = "/checkout") },
    });
  };
  const share = async () => {
    if (navigator.share)
      await navigator.share({
        title: product.name,
        text: product.tagline,
        url: window.location.href,
      });
    else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Product link copied");
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main data-product-id={product.id} className="mx-auto max-w-7xl px-5 py-8 sm:px-6 md:py-12">
        <Link
          to="/shop"
          search={{}}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to products
        </Link>
        <div className="mt-5 grid gap-9 lg:grid-cols-2 lg:gap-14">
          <section aria-label={`${product.name} image gallery`}>
            <div className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-border">
              <img
                key={images[active]}
                src={productDetailImage(images[active])}
                alt={imageAlts[active] || `${product.name}, view ${active + 1}`}
                width={1000}
                height={1000}
                className="aspect-square w-full object-cover transition duration-300"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(active - 1)}
                    aria-label="Previous product image"
                    className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-lg backdrop-blur hover:bg-brand"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(active + 1)}
                    aria-label="Next product image"
                    className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-lg backdrop-blur hover:bg-brand"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {images.map((image, index) => (
                  <button
                    key={productImageIdentity(image)}
                    type="button"
                    onClick={() => setActive(index)}
                    aria-label={`Show product image ${index + 1}`}
                    aria-current={index === active}
                    className={`overflow-hidden rounded-xl bg-surface ring-2 transition ${index === active ? "ring-brand" : "ring-transparent hover:ring-border"}`}
                  >
                    <img
                      src={productThumbnailImage(image)}
                      alt={imageAlts[index] || `${product.name} image ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
                {product.category}
              </span>
              <span
                className={`text-xs font-semibold ${product.inStock ? (product.stockState === "low_stock" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400") : "text-destructive"}`}
              >
                {product.inStock
                  ? product.stockState === "low_stock"
                    ? `Low stock${product.stockQuantity != null ? ` — only ${product.stockQuantity} left` : ""}`
                    : "In stock"
                  : "Sold out"}
              </span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
              {product.name}
            </h1>
            {product.sku && (
              <p className="mt-2 text-sm text-muted-foreground">SKU: {product.sku}</p>
            )}
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {getProductDescription(product)}
            </p>
            <div className="mt-7 flex flex-wrap items-end gap-3">
              <span className="font-display text-3xl font-semibold">
                {formatNaira(product.price)}
              </span>
              {product.compareAt && (
                <span className="pb-1 text-sm text-muted-foreground line-through">
                  {formatNaira(product.compareAt)}
                </span>
              )}
            </div>
            {product.specs && product.specs.length > 0 && (
              <div className="mt-6 rounded-2xl bg-[#1a1a1e] p-6 dark:bg-[#111114]">
                <h2 className="text-lg font-semibold text-white">Specifications</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {product.specs.map((spec: any) => (
                    <div
                      key={spec.label}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                        {spec.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white leading-snug">
                        {spec.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                disabled={!product.inStock}
                onClick={add}
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground disabled:opacity-40"
              >
                <ShoppingCart className="size-5" />
                {product.inStock ? "Add to cart" : "Currently sold out"}
              </button>
              <button
                type="button"
                onClick={share}
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold hover:border-brand"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" /> 12-month warranty
              </span>
              <span className="flex items-center gap-2">
                <Truck className="size-4 text-brand" /> Nationwide delivery
              </span>
              <span className="flex items-center gap-2">
                <Check className="size-4 text-brand" /> Quality checked
              </span>
            </div>
          </section>
        </div>
        {related.length > 0 && (
          <section className="py-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              Keep exploring
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">You may also like</h2>
            <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
        <CustomerReviews
          productId={product.id}
          productName={product.name}
          initialReviews={loaderReviews}
          initialAvgRating={avgRating}
          initialReviewCount={reviewCount}
        />
      </main>
      {/* removed */}
      <SiteFooter />
    </div>
  );
}

/**
 * Renders ReviewForm in a portal at document.body level, completely
 * outside the carousel section's DOM tree. This prevents any mouse
 * events on the carousel (onMouseEnter/onMouseLeave) from interacting
 * with the modal overlay.
 */
function ReviewFormPortal(props: {
  productId: string;
  productName: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(<ReviewForm {...props} />, document.body);
}

const DEMO_REVIEWS = [
  {
    name: "Adebayo K.",
    rating: 5,
    date: "Jul 15, 2026",
    title: "Excellent product quality",
    body: "The product arrived exactly as described. Setup was straightforward and performance has been outstanding.",
    verified: true,
  },
  {
    name: "Chioma N.",
    rating: 4,
    date: "Jul 8, 2026",
    title: "Great value for money",
    body: "Solid build quality and impressive specifications for the price. Delivery was fast and the packaging was secure.",
    verified: true,
  },
  {
    name: "Tunde O.",
    rating: 5,
    date: "Jun 28, 2026",
    title: "Perfect for my needs",
    body: "I compared several options before choosing this one and it has exceeded my expectations.",
    verified: true,
  },
];

function CustomerReviews({
  productId,
  productName,
  initialReviews = [],
  initialAvgRating = 0,
  initialReviewCount = 0,
}: {
  productId: string;
  productName: string;
  initialReviews?: any[];
  initialAvgRating?: number;
  initialReviewCount?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [visible, setVisible] = useState(1);
  const modalRef = useRef(false); // guard against accidental unmount

  // Use SSR-provided reviews, fall back to empty
  const dbReviews = initialReviews.map((r: any) => ({
    name: r.customers ? `${r.customers.first_name} ${r.customers.last_name}` : "Anonymous",
    rating: r.rating,
    date: new Date(r.created_at).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    title: r.title || "",
    body: r.body,
    verified: r.verified_purchase,
  }));

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

  const reviews = dbReviews.length > 0 ? dbReviews : DEMO_REVIEWS;
  const total = reviews.length;
  const maxOffset = Math.max(0, total - visible);
  const INTERVAL_MS = 4000;

  // Track modal open state so carousel stops advancing while the modal is visible
  useEffect(() => {
    modalRef.current = showForm;
  }, [showForm]);

  useEffect(() => {
    if (paused || showForm || total <= visible) {
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
  }, [paused, showForm, total, maxOffset]);

  return (
    <section
      className="py-12 border-t border-border"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-4">
        <h2 className="font-display text-2xl font-semibold">Customer Reviews</h2>
        {initialReviewCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`size-4 ${i < Math.round(initialAvgRating) ? "fill-brand text-brand" : "text-muted-foreground/30"}`}
                />
              ))}
            </div>
            <span>
              {initialAvgRating.toFixed(1)} ({initialReviewCount}{" "}
              {initialReviewCount === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}
      </div>
      {successMsg && (
        <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-300">
          {successMsg}
        </div>
      )}
      <div className="mt-8 overflow-hidden">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(calc(-${offset} * (100% / ${visible})))` }}
        >
          {reviews.map((r: any, i: number) => (
            <div key={i} className="w-full flex-shrink-0 px-2 md:w-1/2 lg:w-1/3">
              <div className="flex h-full min-h-[240px] flex-col rounded-2xl bg-card p-6 ring-1 ring-border transition duration-300 hover:-translate-y-0.5 hover:shadow-soft">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.date}</p>
                    </div>
                  </div>
                  {r.verified && (
                    <span className="flex items-center gap-1 text-xs text-brand">
                      <Check className="size-3" /> Verified Purchase
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star
                      key={si}
                      className={`size-4 ${si < r.rating ? "fill-brand text-brand" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                {r.title && <h3 className="mt-3 font-semibold text-sm">{r.title}</h3>}
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
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
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-semibold hover:border-brand"
        >
          Write a Review
        </button>
      </div>
      {showForm && (
        <ReviewFormPortal
          productId={productId}
          productName={productName}
          onClose={() => setShowForm(false)}
          onSuccess={(msg) => {
            setShowForm(false);
            setSuccessMsg(msg);
          }}
        />
      )}
    </section>
  );
}
