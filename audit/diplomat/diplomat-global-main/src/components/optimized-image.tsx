import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type OptimizedImageProps = {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  containerClassName?: string;
  sizes?: string;
  priority?: boolean;
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill";
};

/** Skeleton shimmer that matches image dimensions — zero CLS. */
function Skeleton({
  className,
  aspectRatio = "4/3",
}: {
  className?: string;
  aspectRatio?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-inherit bg-gradient-to-r from-muted/50 via-muted/80 to-muted/50 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]",
        className,
      )}
      style={{ aspectRatio }}
      aria-hidden="true"
    />
  );
}

/** Clean branded fallback — no giant error text. */
function ErrorFallback({ alt, className }: { alt: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-inherit bg-gradient-to-br from-muted/20 to-muted/40",
        className,
      )}
      aria-label={`Image not available: ${alt}`}
    >
      <svg
        className="size-8 text-muted-foreground/25"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </div>
  );
}

export function OptimizedImage({
  src,
  alt,
  width = 800,
  height = 600,
  className,
  containerClassName,
  sizes,
  priority = false,
  aspectRatio,
  objectFit = "cover",
}: OptimizedImageProps) {
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">(() =>
    priority ? "loading" : "idle",
  );
  const imgRef = useRef<HTMLImageElement>(null);

  const handleLoad = useCallback(() => setState("loaded"), []);
  const handleError = useCallback(() => setState("error"), []);

  // For priority images, start loading immediately
  useEffect(() => {
    if (priority && src && state === "idle") {
      setState("loading");
    }
  }, [priority, src, state]);

  // Fix for SSR hydration: if the image is already in the browser cache
  // (e.g., from a previous visit or preload), detect it immediately
  useEffect(() => {
    if (src && state === "idle" && imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      setState("loaded");
    }
  }, [src, state]);

  const computedAspectRatio = aspectRatio || (width && height ? `${width}/${height}` : "4/3");

  if (!src || state === "error") {
    return (
      <div
        className={cn("relative overflow-hidden", containerClassName)}
        style={{ aspectRatio: computedAspectRatio }}
      >
        <ErrorFallback alt={alt} className={className} />
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden", containerClassName)}
      style={{ aspectRatio: computedAspectRatio }}
    >
      {/* Skeleton visible only for non-priority images while loading */}
      {!priority && state !== "loaded" && (
        <Skeleton className="absolute inset-0 h-full w-full" aspectRatio={computedAspectRatio} />
      )}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        srcSet={sizes ? responsiveSrcSet(src) : undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          "h-full w-full object-cover",
          priority ? "" : "transition-opacity duration-300",
          objectFit === "contain" && "object-contain",
          objectFit === "fill" && "object-fill",
          priority ? "opacity-100" : state === "loaded" ? "opacity-100" : "opacity-0",
          "motion-reduce:transition-none",
          className,
        )}
        style={{
          transitionProperty: priority ? undefined : "opacity",
        }}
      />
    </div>
  );
}

/**
 * Wrapper to add responsive srcset for Cloudinary images.
 * Falls back to single src if not a Cloudinary URL.
 */
export function responsiveSrcSet(
  url: string | null | undefined,
  widths: number[] = [400, 800, 1200],
): string | undefined {
  if (!url || !url.includes("cloudinary.com")) return undefined;

  return widths
    .map((w) => {
      const optimized = url
        .replace("/upload/", `/upload/f_auto,q_auto,w_${w},c_limit/`)
        .replace(
          /\/upload\/f_auto,q_auto,w_\d+,c_limit\/f_auto,q_auto,w_\d+,c_limit\//,
          `/upload/f_auto,q_auto,w_${w},c_limit/`,
        );
      return `${optimized} ${w}w`;
    })
    .join(", ");
}
