import { describe, expect, it, vi } from "vitest";
import { findUnsharedProductAssets } from "@/lib/product-media-cleanup.server";

/**
 * Product-delete Cloudinary cleanup contract:
 * an asset may be destroyed ONLY when it is proven owned (products/ prefix,
 * verified res.cloudinary.com URL) AND unreferenced across every content
 * table. Any scan failure or budget overrun retains everything (fail closed).
 */

type Row = Record<string, unknown>;

function makeDb(tables: Record<string, Row[]>) {
  const errors: Record<string, unknown> = {};
  return {
    setError(table: string, error: unknown) {
      errors[table] = error;
    },
    from(table: string) {
      let range: [number, number] | null = null;
      return {
        select: () => ({
          order: () => ({
            range: (_from: number, _to: number) => {
              range = [_from, _to];
              const rows = tables[table] ?? [];
              const err = errors[table];
              return Promise.resolve({
                data: err ? null : rows.slice(range![0], range![1] + 1),
                error: err ?? null,
              });
            },
          }),
        }),
      };
    },
  } as never;
}

const CLOUD = "demo-cloud";
const OWNED = {
  cloudinary_public_id: "diplomat-global/products/abc123",
  secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/diplomat-global/products/abc123.jpg",
};
const OWNED_2 = {
  cloudinary_public_id: "diplomat-global/products/def456",
  secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/diplomat-global/products/def456.jpg",
};
const FOREIGN = {
  cloudinary_public_id: "diplomat-global/hero/xyz",
  secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/diplomat-global/hero/xyz.jpg",
};

describe("findUnsharedProductAssets — product delete cleanup safety", () => {
  it("destroys only proven-owned assets unreferenced across all content tables", async () => {
    const db = makeDb({
      product_images: [],
      products: [{ id: "p1", description: "plain", specifications: "{}" }],
      blog_posts: [],
      hero_slides: [],
      site_pages: [],
      site_settings: [],
    });
    const plan = await findUnsharedProductAssets(db, [OWNED, FOREIGN], CLOUD);
    expect(plan.scanFailed).toBe(false);
    expect(plan.safe).toEqual([OWNED.cloudinary_public_id]); // hero asset never a candidate
    expect(plan.retained).toEqual([FOREIGN.cloudinary_public_id]);
  });

  it("retains an asset referenced by any content table (blog body)", async () => {
    const db = makeDb({
      product_images: [],
      products: [],
      blog_posts: [{ id: "b1", image: null, content: `<img src="${OWNED.secure_url}">` }],
      hero_slides: [],
      site_pages: [],
      site_settings: [],
    });
    const plan = await findUnsharedProductAssets(db, [OWNED], CLOUD);
    expect(plan.safe).toEqual([]);
    expect(plan.retained).toEqual([OWNED.cloudinary_public_id]);
  });

  it("retains URL-encoded references (rich-text editors percent-encode)", async () => {
    const encoded = OWNED.secure_url.replace(/\//g, "%2F");
    const db = makeDb({
      product_images: [],
      products: [],
      blog_posts: [],
      hero_slides: [],
      site_pages: [{ id: "s1", content: `https:%2F%2Fres.cloudinary.com...${encoded}` }],
      site_settings: [],
    });
    const plan = await findUnsharedProductAssets(db, [OWNED], CLOUD);
    expect(plan.safe).toEqual([]);
  });

  it("fails closed on any table scan error: nothing destroyed", async () => {
    const db = makeDb({ site_settings: [] });
    db.setError("blog_posts", { message: "boom" });
    const plan = await findUnsharedProductAssets(
      db,
      [OWNED, OWNED_2],
      CLOUD,
    );
    expect(plan.scanFailed).toBe(true);
    expect(plan.safe).toEqual([]);
    expect(plan.retained).toEqual([OWNED.cloudinary_public_id, OWNED_2.cloudinary_public_id]);
  });

  it("fails closed when the pagination budget is exhausted (10k rows)", async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, value: "filler" }));
    const from = vi.fn();
    const db = {
      from: (table: string) => {
        from(table);
        return {
          select: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: page, error: null }),
            }),
          }),
        };
      },
    } as never;
    const plan = await findUnsharedProductAssets(db, [OWNED], CLOUD);
    expect(plan.scanFailed).toBe(true);
    expect(plan.safe).toEqual([]);
  });

  it("retains assets whose secure_url cannot be proven (no candidate)", async () => {
    const unprovable = {
      cloudinary_public_id: "diplomat-global/products/ghost",
      secure_url: "not a url",
    };
    const db = makeDb({
      product_images: [],
      products: [],
      blog_posts: [],
      hero_slides: [],
      site_pages: [],
      site_settings: [],
    });
    const plan = await findUnsharedProductAssets(db, [unprovable], CLOUD);
    expect(plan.safe).toEqual([]);
    expect(plan.retained).toEqual(["diplomat-global/products/ghost"]);
  });

  it("returns empty plan with no candidates without touching the DB", async () => {
    const db = makeDb({});
    const plan = await findUnsharedProductAssets(db, [], CLOUD);
    expect(plan).toEqual({ safe: [], retained: [], scanFailed: false });
  });
});
