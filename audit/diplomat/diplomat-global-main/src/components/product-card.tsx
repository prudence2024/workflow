import { Link } from "@tanstack/react-router";
import { Check, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/store-provider";
import { formatNaira, type Product } from "@/lib/products";
import { productCardImage } from "@/lib/cloudinary-utils";
import { OptimizedImage } from "@/components/optimized-image";

/** Deterministic pseudo-rating so cards stay stable across renders. */
function ratingFor(id: string): { stars: 4 | 5; reviews: number } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { stars: hash % 3 === 0 ? 4 : 5, reviews: 40 + (hash % 320) };
}

export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const { addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const { stars, reviews } = ratingFor(product.id);
  const savings = product.compareAt ? product.compareAt - product.price : 0;
  const lowStock = product.inStock && product.stockState === "low_stock";

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product.id, {
      id: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      category: product.category,
      price: product.price,
      image: product.image,
      inStock: product.inStock,
    });
    setAdded(true);
    toast.success(`${product.name} added to cart`, {
      description: "You can review it in your cart or continue shopping.",
      action: { label: "Checkout", onClick: () => (window.location.href = "/checkout") },
    });
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      aria-label={`View ${product.name}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft hover:ring-brand/40"
    >
      <div className="relative aspect-[4/3] sm:aspect-square overflow-hidden bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
        <OptimizedImage
          src={productCardImage(product.image)}
          alt={product.name}
          width={800}
          height={800}
          priority={priority}
          className="transition-transform duration-500 group-hover:scale-[1.04]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          aspectRatio="1/1"
        />
        {product.isNew && (
          <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-brand-foreground shadow-sm">
            New
          </span>
        )}
        {savings > 0 && product.inStock && (
          <span className="absolute bottom-3 left-3 rounded-full bg-inverse/85 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-inverse-foreground backdrop-blur">
            Save {formatNaira(savings)}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute left-3 top-3 rounded-full bg-inverse/85 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-inverse-foreground backdrop-blur">
            Sold out
          </span>
        )}
        {product.inStock && product.stockState === "low_stock" && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">
            Low stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 min-[400px]:p-4 sm:p-5">
        <div className="mb-1 truncate text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground min-[400px]:mb-1.5">
          {product.category}
        </div>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-ink min-[400px]:min-h-10 min-[400px]:text-sm sm:text-[15px]">
          {product.name}
        </h3>
        <p className="mt-1 hidden min-[400px]:line-clamp-2 min-[400px]:min-h-[2rem] min-[400px]:text-xs min-[400px]:text-muted-foreground sm:block">
          {product.tagline}
        </p>
        <div className="mt-2 flex items-center gap-1.5 sm:mt-2.5">
          <span className="flex gap-0.5 text-amber-500" aria-label={`${stars} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`size-3 ${i < stars ? "fill-current" : "text-muted-foreground/30"}`}
              />
            ))}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground min-[400px]:text-[11px]">
            {reviews} reviews
          </span>
        </div>
        {/* Wrapping footer: the price keeps its natural one-line width and the
            CTA drops below it when the card is too narrow for both — the price
            never wraps character-by-character and the button never overflows
            the card edge (the old minmax(0,1fr)/auto grid let the price column
            collapse to ~0 at md 4-across widths while break-words made
            per-character wrapping legal). */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-3 min-[400px]:gap-y-3 min-[400px]:pt-4">
          <div className="flex-1 basis-24">
            <span className="block font-display text-[13px] font-semibold tabular-nums text-ink min-[400px]:text-sm sm:text-lg">
              {formatNaira(product.price)}
            </span>
            {product.compareAt && (
              <span className="block text-[10px] text-muted-foreground line-through min-[400px]:text-[11px]">
                {formatNaira(product.compareAt)}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!product.inStock}
            onClick={handleAdd}
            aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`}
            className="inline-flex min-h-[2.25rem] max-sm:w-full items-center justify-center gap-1.5 rounded-lg bg-inverse px-2.5 text-[11px] font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 min-[400px]:min-h-10 min-[400px]:rounded-xl min-[400px]:px-3 min-[400px]:text-xs sm:ml-auto sm:w-auto"
          >
            {added ? (
              <Check className="size-3.5 min-[400px]:size-4" />
            ) : (
              <ShoppingCart className="size-3.5 min-[400px]:size-4" />
            )}
            <span>{added ? "Added" : product.inStock ? "Add to cart" : "Sold out"}</span>
          </button>
        </div>
        {/* Reserved slot keeps card height identical whether or not the
            product is low-stock (equal-height mobile grid rows). */}
        <p
          className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 empty:hidden"
          aria-hidden={!lowStock}
        >
          {lowStock ? `Only ${product.stockQuantity ?? "few"} left` : ""}
        </p>
      </div>
    </Link>
  );
}
