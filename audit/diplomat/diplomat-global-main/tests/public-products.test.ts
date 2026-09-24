import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: false,
  filters: [] as [string, unknown][],
}));
vi.mock("../src/lib/admin/admin-ops.server", () => ({
  getDatabaseConfig: () => ({}),
  createDatabaseClient: () => ({
    from: (table: string) => {
      if (table === "site_settings")
        return {
          select: () => ({
            in: async () => ({
              data: [{ key: "low_stock_threshold_default", value: "5" }],
              error: null,
            }),
          }),
        };
      let single = false;
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        eq: (key: string, value: unknown) => {
          state.filters.push([key, value]);
          return query;
        },
        neq: (key: string, value: unknown) => {
          state.filters.push(["!" + key, value]);
          return query;
        },
        // PostgREST `in.(...)`: membership in an explicit value list. The public
        // PDP resolver uses it to accept the historical trailing-space slug
        // variants alongside the canonical value.
        in: (key: string, values: unknown[]) => {
          state.filters.push(["IN:" + key, values]);
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        then: (resolve: (result: unknown) => unknown) => {
          const rows = state.rows.filter((row) =>
            state.filters.every(([key, value]) => {
              if (key.startsWith("!")) return row[key.slice(1)] !== value;
              if (key.startsWith("IN:"))
                return ((value as unknown[]) ?? []).includes(row[key.slice(3)]);
              return row[key] === value;
            }),
          );
          return Promise.resolve(
            resolve({
              data: single ? (rows[0] ?? null) : rows,
              error: state.error ? { code: "08006" } : null,
              count: rows.length,
            }),
          );
        },
      };
      return query;
    },
  }),
}));
import {
  loadPublicProducts,
  loadPublicProductBySlug,
  loadRelatedProducts,
  loadPublicProductsPaginated,
} from "../src/lib/admin/server-fns";
// The test adapter invokes real handler bodies with an in-memory read-only query boundary.
const invoke = (fn: unknown, data = {}) =>
  (fn as (input: { data: unknown }) => Promise<unknown>)({ data });
beforeEach(() => {
  state.rows = [];
  state.error = false;
  state.filters = [];
});
describe("public product authority", () => {
  it.each([
    [0, 3, "out_of_stock"],
    [1, 3, "low_stock"],
    [3, 3, "low_stock"],
    [4, 3, "in_stock"],
    [4, undefined, "low_stock"],
    [4, 2, "in_stock"],
    [1, 0, "in_stock"],
  ])(
    "propagates quantity %s threshold %s through every public loader",
    async (quantity, threshold, expected) => {
      state.rows = [
        {
          id: "B",
          slug: "b",
          status: "active",
          in_stock: true,
          inventory: { quantity, low_stock_threshold: threshold },
          product_images: [],
        },
      ];
      for (const [fn, data] of [
        [loadPublicProducts, {}],
        [
          loadPublicProductsPaginated,
          { page: 1, pageSize: 5, categories: [], q: "", sort: "newest" },
        ],
        [loadPublicProductBySlug, { slug: "b" }],
        [loadRelatedProducts, { limit: 4 }],
      ] as const) {
        state.filters = [];
        const result = (await invoke(fn, data)) as { products?: unknown[]; product?: unknown };
        expect(result.product ?? result.products?.[0]).toMatchObject({
          stockQuantity: quantity,
          stockState: expected,
          inStock: quantity! > 0,
        });
      }
    },
  );
  it("returns the current active DB catalogue without draft products", async () => {
    state.rows = [
      { id: "current", status: "active", price: 85000, product_images: [] },
      { id: "inactive", status: "draft" },
    ];
    expect(await invoke(loadPublicProducts)).toMatchObject({
      products: [{ id: "current", price: 85000 }],
    });
  });
  it("returns a true empty catalogue", async () => {
    expect(await invoke(loadPublicProducts)).toEqual({ products: [] });
  });
  it("returns missing for deleted product slugs", async () => {
    expect(await invoke(loadPublicProductBySlug, { slug: "deleted-product" })).toEqual({
      product: null,
    });
  });
  it("keeps empty recommendations empty", async () => {
    expect(await invoke(loadRelatedProducts, { excludeId: "A", limit: 4 })).toEqual({
      products: [],
    });
  });
  it.each([
    loadPublicProducts,
    loadPublicProductBySlug,
    loadRelatedProducts,
    loadPublicProductsPaginated,
  ])("reports DB failure instead of substituting static products", async (fn) => {
    state.error = true;
    await expect(
      invoke(fn, {
        slug: "B",
        limit: 4,
        page: 1,
        pageSize: 5,
        categories: [],
        q: "",
        sort: "newest",
      }),
    ).rejects.toThrow(/temporarily unavailable/);
  });
  it("excludes inactive and current products from recommendations", async () => {
    state.rows = [
      { id: "A", status: "active", product_images: [] },
      { id: "B", status: "active", product_images: [] },
      { id: "C", status: "draft", product_images: [] },
    ];
    const result = (await invoke(loadRelatedProducts, { excludeId: "A", limit: 4 })) as {
      products: { id: string }[];
    };
    expect(result.products.map((p) => p.id)).toEqual(["B"]);
    expect(state.filters).toContainEqual(["status", "active"]);
  });
  it("loads only the current active slug and saved primary image", async () => {
    state.rows = [
      {
        id: "B",
        slug: "b",
        status: "active",
        price: 12,
        product_images: [
          { secure_url: "second.jpg", sort_order: 1 },
          { secure_url: "first.jpg", sort_order: 0 },
        ],
      },
    ];
    expect(await invoke(loadPublicProductBySlug, { slug: "b" })).toMatchObject({
      product: { id: "B", image: "first.jpg", images: ["first.jpg", "second.jpg"] },
    });
    // The lookup stays slug-scoped and active-only; it now asks for the
    // canonical slug PLUS its leading/trailing-space variants so the clean
    // canonical URL and older url-encoded `%20` links both resolve.
    const slugFilter = state.filters.find(([key]) => key === "IN:slug");
    expect(slugFilter?.[1]).toEqual(["b", "b ", " b"]);
    expect(state.filters).toContainEqual(["status", "active"]);
    expect(state.filters.every(([key]) => key === "IN:slug" || key === "status")).toBe(true);
  });
});
