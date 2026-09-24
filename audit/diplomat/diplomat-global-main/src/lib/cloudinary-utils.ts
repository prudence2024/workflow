/**
 * Cloudinary URL optimization utilities.
 *
 * Appends f_auto (automatic format: AVIF/WebP/JPEG) and q_auto (automatic quality)
 * to Cloudinary URLs for optimized delivery.
 *
 * Does NOT modify the stored original — only transforms the delivery URL.
 */

/**
 * Optimize a Cloudinary URL for delivery.
 * Transforms:
 *   https://res.cloudinary.com/xxx/image/upload/v123/folder/file.jpg
 *   → https://res.cloudinary.com/xxx/image/upload/f_auto,q_auto/v123/folder/file.jpg
 *
 * Non-Cloudinary URLs are returned unchanged.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  options?: { width?: number; height?: number; crop?: string },
): string {
  if (!url || !url.includes("cloudinary.com")) return url || "";

  // Find the /upload/ segment and insert transformations after it
  const uploadIdx = url.indexOf("/upload/");
  if (uploadIdx === -1) return url;

  const before = url.slice(0, uploadIdx + "/upload/".length);
  const after = url.slice(uploadIdx + "/upload/".length);

  // Build transformation string
  const transforms: string[] = ["f_auto", "q_auto"];

  if (options?.width) transforms.push(`w_${options.width}`);
  if (options?.height) transforms.push(`h_${options.height}`);
  if (options?.crop) transforms.push(`c_${options.crop}`);

  return `${before}${transforms.join(",")}/${after}`;
}

/**
 * Optimized URL for product cards (small thumbnails).
 * ~400px wide, auto format, auto quality.
 */
export function productCardImage(url: string | null | undefined): string {
  return optimizedImageUrl(url, { width: 400, crop: "limit" });
}

/**
 * Optimized URL for product detail main image.
 * ~800px wide for detail view.
 */
export function productDetailImage(url: string | null | undefined): string {
  return optimizedImageUrl(url, { width: 800, crop: "limit" });
}

/**
 * Optimized URL for product detail thumbnails.
 * ~200px wide.
 */
export function productThumbnailImage(url: string | null | undefined): string {
  return optimizedImageUrl(url, { width: 200, crop: "limit" });
}

/**
 * Optimized URL for hero slides.
 * ~1200px wide, maintaining quality for large display.
 */
export function heroSlideImage(url: string | null | undefined): string {
  return optimizedImageUrl(url, { width: 1200, crop: "limit" });
}

/**
 * Optimized URL for blog images.
 * ~800px wide.
 */
export function blogImage(url: string | null | undefined): string {
  return optimizedImageUrl(url, { width: 800, crop: "limit" });
}

/**
 * Admin thumbnails — no optimization needed (small size).
 */
export function adminThumbnail(url: string | null | undefined): string {
  return url || "";
}
