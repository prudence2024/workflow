import { describe, expect, it } from "vitest";
import {
  mapProductGallery,
  productImageIdentity,
  productImageSelection,
  uniqueProductImages,
} from "../src/lib/product-gallery";

const a = "https://res.cloudinary.com/store/image/upload/v123/catalog/a.jpg";
const b = "https://res.cloudinary.com/store/image/upload/v124/catalog/b.jpg";
const b2 = "https://res.cloudinary.com/store/image/upload/v125/catalog/b-detail.jpg";

describe("current product gallery", () => {
  it("keeps different clouds and folders distinct despite matching filenames", () => {
    expect(
      uniqueProductImages({
        image: b,
        images: [b.replace("/store/", "/another/"), b.replace("/catalog/", "/another-folder/")],
      }),
    ).toHaveLength(3);
    const prefixedFolder = b.replace("/catalog/", "/q_assets/");
    expect(productImageIdentity(prefixedFolder)).toContain("/q_assets/b");
  });
  it("shows B primary exactly once on direct load", () => {
    expect(uniqueProductImages({ image: b, images: [b, b2] })).toEqual([b, b2]);
  });
  it("deduplicates transformed URLs by canonical Cloudinary asset", () => {
    const transformed = b.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
    expect(productImageIdentity(transformed)).toBe("/store/image/upload/catalog/b");
    expect(uniqueProductImages({ image: b, images: [transformed, b2] })).toEqual([b, b2]);
  });
  it("uses explicit public IDs and preserves saved order without mutating source rows", () => {
    const rows = [
      { secure_url: b2, sort_order: 2, cloudinary_public_id: "catalog/b-detail" },
      { secure_url: b, sort_order: 0, cloudinary_public_id: "catalog/b", alt_text: "Primary" },
      { secure_url: b + "?duplicate", sort_order: 1, cloudinary_public_id: "catalog/b" },
    ];
    expect(mapProductGallery(rows)).toEqual({
      image: b,
      images: [b, b2],
      imageAlts: ["Primary", ""],
    });
    expect(rows[0].secure_url).toBe(b2);
  });
  it("does not carry A into B and produces unique React asset keys", () => {
    uniqueProductImages({ image: a, images: [a] });
    const images = uniqueProductImages({ image: b, images: [b, b2] });
    expect(images).not.toContain(a);
    expect(new Set(images.map((url) => productImageIdentity(url))).size).toBe(images.length);
  });
  it("resets selection across recommendation, Back, and Forward navigation", () => {
    let selected = { productId: "A", index: 2 };
    expect(productImageSelection("A", selected, 3)).toBe(2);
    expect(productImageSelection("B", selected, 2)).toBe(0);
    selected = { productId: "B", index: 1 };
    expect(productImageSelection("A", selected, 3)).toBe(0);
    selected = { productId: "A", index: 0 };
    expect(productImageSelection("B", selected, 2)).toBe(0);
  });
  it("resets a selected index removed from the current gallery", () => {
    expect(productImageSelection("B", { productId: "B", index: 2 }, 1)).toBe(0);
  });
  it("permits intentionally shared assets independently for each product", () => {
    expect(uniqueProductImages({ image: a, images: [a, b] })).toEqual([a, b]);
    expect(uniqueProductImages({ image: a, images: [a, b2] })).toEqual([a, b2]);
  });
});
