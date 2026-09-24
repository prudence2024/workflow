import "@tanstack/react-start/server-only";
import type { createDatabaseClient } from "./database.server";

type Db = ReturnType<typeof createDatabaseClient>;
type Image = { cloudinary_public_id?: string | null; secure_url?: string | null };

/** Fail closed if a reference scan fails or exceeds its bounded work budget. */
export async function findUnsharedProductAssets(db: Db, images: Image[], cloudName: string) {
  const candidates = new Set<string>();
  for (const image of images) {
    const id = image.cloudinary_public_id;
    if (!id?.startsWith("diplomat-global/products/") || id.includes("..")) continue;
    try {
      const url = new URL(image.secure_url ?? "");
      const path = decodeURIComponent(url.pathname);
      if (
        url.protocol === "https:" &&
        url.hostname === "res.cloudinary.com" &&
        path.startsWith(`/${cloudName}/image/upload/`) &&
        path.includes(`/${id}.`)
      )
        candidates.add(id);
    } catch {
      /* Unproven URL: retain asset. */
    }
  }
  const all = [
    ...new Set(
      images.map((image) => image.cloudinary_public_id).filter((id): id is string => !!id),
    ),
  ];
  if (!candidates.size) return { safe: [], retained: all, scanFailed: false };
  // Include draft/hidden content and rich content bodies, not just visible galleries.
  const sources = [
    ["product_images", "id", "id, cloudinary_public_id, secure_url"],
    ["products", "id", "id, description, specifications"],
    ["blog_posts", "id", "id, image, content"],
    ["hero_slides", "id", "id, image"],
    ["site_pages", "id", "id, content"],
    ["site_settings", "key", "key, value"],
  ];
  try {
    for (const [table, order, columns] of sources) {
      let finished = false;
      for (let offset = 0; offset < 10_000; offset += 200) {
        const { data, error } = await db
          .from(table)
          .select(columns)
          .order(order)
          .range(offset, offset + 199);
        if (error || !Array.isArray(data)) throw new Error("Reference scan unavailable");
        for (const row of data) {
          let text = JSON.stringify(row);
          try {
            text = decodeURIComponent(text);
          } catch {
            /* Keep conservative raw matching. */
          }
          for (const id of candidates)
            if (text.includes(id) || text.includes(encodeURIComponent(id))) candidates.delete(id);
        }
        if (data.length < 200) {
          finished = true;
          break;
        }
      }
      if (!finished) throw new Error("Reference scan limit reached");
    }
    return {
      safe: [...candidates],
      retained: all.filter((id) => !candidates.has(id)),
      scanFailed: false,
    };
  } catch {
    return { safe: [], retained: all, scanFailed: true };
  }
}
