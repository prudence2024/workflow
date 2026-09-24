import { describe, expect, it } from "vitest";
import { pickProductBySlug, productSlugCandidates } from "../src/lib/product-slug";

describe("productSlugCandidates — whitespace-tolerant slug lookup", () => {
  it("returns the canonical slug plus its edge-whitespace variants", () => {
    expect(productSlugCandidates("Ls32a700nwnxza")).toEqual([
      "Ls32a700nwnxza",
      "Ls32a700nwnxza ",
      " Ls32a700nwnxza",
    ]);
  });

  it("normalizes an incoming slug that already carries the historical trailing space", () => {
    // This is what a URL with %20 decodes to for a pre-normalization record.
    expect(productSlugCandidates("Ls32a700nwnxza ")).toEqual([
      "Ls32a700nwnxza",
      "Ls32a700nwnxza ",
      " Ls32a700nwnxza",
    ]);
  });

  it("preserves legitimate inner whitespace", () => {
    expect(productSlugCandidates("LG 34wp75c-b")).toEqual([
      "LG 34wp75c-b",
      "LG 34wp75c-b ",
      " LG 34wp75c-b",
    ]);
  });

  it("returns no candidates for a blank slug", () => {
    expect(productSlugCandidates("")).toEqual([]);
    expect(productSlugCandidates("   ")).toEqual([]);
  });
});

describe("pickProductBySlug — prefers the exact canonical row", () => {
  const rows = [{ slug: "Ls32a700nwnxza " }, { slug: "Ls32a700nwnxza" }];

  it("picks the exact match regardless of row order", () => {
    expect(pickProductBySlug(rows, "Ls32a700nwnxza")).toEqual({ slug: "Ls32a700nwnxza" });
    expect(pickProductBySlug(rows, "Ls32a700nwnxza ")).toEqual({ slug: "Ls32a700nwnxza" });
  });

  it("falls back to the only whitespace-variant row during the transition", () => {
    expect(pickProductBySlug([{ slug: "Ls32a700nwnxza " }], "Ls32a700nwnxza")).toEqual({
      slug: "Ls32a700nwnxza ",
    });
  });

  it("returns null for no rows", () => {
    expect(pickProductBySlug([], "x")).toBeNull();
    expect(pickProductBySlug(null, "x")).toBeNull();
  });
});
