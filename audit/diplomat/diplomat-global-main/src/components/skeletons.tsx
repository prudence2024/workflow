import { Skeleton } from "@/components/ui/skeleton";

/**
 * Structural mirrors of the components they replace. Every skeleton here must
 * keep the real component's image aspect ratio, text-row hierarchy, reserved
 * heights and padding so that replacement causes no layout shift (CLS=0).
 *
 * When a real component's structure changes, update its mirror in the same
 * change — they are 1:1 counterparts, not generic placeholders.
 */

/**
 * Mirror of ProductCard: 1/1 media block, category eyebrow, reserved
 * 2-line-clamp title area (min-h parity at <400px and ≥400px), tagline rows
 * (≥sm), rating row, price + full-width/inline action row.
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
      {/* Real card media: aspect-[4/3] sm:aspect-square — skeleton mirrors both breakpoints */}
      <Skeleton className="aspect-[4/3] w-full rounded-none sm:aspect-square" />
      <div className="flex flex-1 flex-col p-3 min-[400px]:p-4 sm:p-5">
        <Skeleton className="mb-1 h-3 w-20 min-[400px]:mb-1.5" />
        {/* Reserved title area: matches h3 line-clamp-2 min-h-[2.5rem] min-[400px]:min-h-10 */}
        <div className="min-h-[2.5rem] space-y-1.5 min-[400px]:min-h-10">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5 min-[400px]:h-5" />
        </div>
        {/* Tagline rows: real tagline is hidden below 400px, 2-clamped from sm */}
        <div className="mt-1 hidden min-[400px]:block sm:hidden">
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="mt-1 hidden space-y-1.5 sm:block">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="mt-2 flex items-center gap-1.5 sm:mt-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="mt-auto grid gap-2 pt-3 min-[400px]:gap-3 min-[400px]:pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-24 min-[400px]:h-5 sm:h-5" />
          </div>
          <Skeleton className="h-9 w-full rounded-lg min-[400px]:h-10 min-[400px]:rounded-xl sm:w-auto sm:min-w-28" />
        </div>
      </div>
    </div>
  );
}

/**
 * Mirror of the Blog index card: 16/10 media block, category-chip + date meta
 * row, reserved 2-line title clamp, reserved 3-line excerpt clamp, read-time
 * footer row.
 */
export function BlogPostSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Reserved title area: h3 line-clamp-2 at text-lg leading-snug */}
        <div className="mt-3 min-h-[3.5rem] space-y-2">
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        {/* Reserved excerpt area: line-clamp-3 text-sm (real card reserves this
            only when an excerpt exists; the skeleton matches the common case) */}
        <div className="mt-2 min-h-[3.75rem] space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

/**
 * Mirror of the Product Detail two-column layout: square gallery with
 * prev/next affordances, 3-column thumbnail row, then the right-column
 * hierarchy (category/status row, large title, SKU, description block, price,
 * action buttons, trust badges).
 */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 md:py-12">
      <Skeleton className="inline-block h-4 w-36" />
      <div className="mt-5 grid gap-9 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-border">
            <Skeleton className="aspect-square w-full rounded-none" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="mt-4 h-9 w-3/4 min-[400px]:h-11 md:h-14" />
          <Skeleton className="mt-2 h-4 w-28" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
          <Skeleton className="mt-7 h-10 w-32" />
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <Skeleton className="h-13 w-full rounded-xl" />
            <Skeleton className="h-13 w-full rounded-xl sm:w-28" />
          </div>
          <div className="mt-6 flex gap-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
