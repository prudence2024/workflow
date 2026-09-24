interface ProductImageRow {
  secure_url: string;
  cloudinary_public_id?: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
}

export function productImageIdentity(url: string, publicId?: string | null): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "res.cloudinary.com") {
      const path = parsed.pathname.split("/image/upload/")[1];
      if (path) {
        const segments = path.split("/");
        const version = segments.findIndex((part) => /^v\d+$/.test(part));
        const asset = version >= 0 ? segments.slice(version + 1) : segments;
        if (version < 0) {
          while (asset[0] && /^(?:[a-z]{1,3}_|\$)/.test(asset[0])) asset.shift();
        }
        const identity = publicId || decodeURIComponent(asset.join("/").replace(/\.[^./]+$/, ""));
        return `${parsed.pathname.split("/image/upload/")[0]}/image/upload/${identity}`;
      }
    }
  } catch {
    // Local image paths are already canonical.
  }
  return publicId || url;
}

/** Preserve saved order and keep the primary image and thumbnail list consistent. */
export function mapProductGallery(rows: ProductImageRow[] | null | undefined) {
  const seen = new Set<string>();
  const ordered = [...(rows ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((row) => {
      const identity = productImageIdentity(row.secure_url, row.cloudinary_public_id);
      if (!row.secure_url || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  return {
    image: ordered[0]?.secure_url || "/content/hero/slide-1.jpg",
    images: ordered.map((row) => row.secure_url),
    imageAlts: ordered.map((row) => row.alt_text || ""),
  };
}

export function uniqueProductImages(product: { image: string; images?: string[] }) {
  const seen = new Set<string>();
  return [product.image, ...(product.images ?? [])].filter((image) => {
    const identity = productImageIdentity(image);
    if (!image || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function productImageSelection(
  productId: string,
  selected: { productId: string; index: number },
  count: number,
) {
  return selected.productId === productId && selected.index >= 0 && selected.index < count
    ? selected.index
    : 0;
}
