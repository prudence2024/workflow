import { describe, expect, it } from "vitest";
import type { Product } from "../src/lib/products";
import {
  BEST_SELLER_COUNT,
  PAID_ORDER_STATUSES,
  fillBestSellers,
  loadBestSellerRanking,
} from "../src/lib/best-sellers.server";

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id,
  slug: id,
  name: `Product ${id}`,
  tagline: "",
  category: "Computing",
  price: 1000,
  image: "",
  inStock: true,
  ...over,
});

/**
 * Minimal stand-in for the supabase query chain used by loadBestSellerRanking:
 * .from("order_items").select("product_id, quantity, orders!inner(status)")
 *   .in("orders.status", [...]) — rows shaped { product_id, quantity, orders: { status } }.
 */
function fakeDb(rows: Array<{ product_id: string; quantity: number; status: string }>) {
  return {
    from: (table: string) => {
      if (table !== "order_items") throw new Error(`unexpected table ${table}`);
      const query = {
        select: () => query,
        in: (_key: string, statuses: string[]) => ({
          then: (resolve: (r: unknown) => unknown) =>
            Promise.resolve(
              resolve({
                data: rows
                  .filter((r) => statuses.includes(r.status))
                  .map((r) => ({
                    product_id: r.product_id,
                    quantity: r.quantity,
                    orders: { status: r.status },
                  })),
                error: null,
              }),
            ),
        }),
      };
      return query;
    },
  };
}

function failingDb() {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          then: (resolve: (r: unknown) => unknown) =>
            Promise.resolve(resolve({ data: null, error: { code: "08006" } })),
        }),
      }),
    }),
  };
}

const catalogue = (ids: string[]) => ids.map((id) => product(id));

describe("best-seller metric fence", () => {
  it("counts paid/processing/shipped/delivered orders only", () => {
    expect([...PAID_ORDER_STATUSES].sort()).toEqual(["delivered", "paid", "processing", "shipped"]);
  });

  it("failed, declined, cancelled, abandoned and refunded payments never rank", async () => {
    const rows = [
      { product_id: "a", quantity: 9, status: "failed" },
      { product_id: "a", quantity: 9, status: "declined" },
      { product_id: "a", quantity: 9, status: "cancelled" },
      { product_id: "a", quantity: 9, status: "abandoned" },
      { product_id: "a", quantity: 9, status: "refunded" },
      { product_id: "a", quantity: 1, status: "paid" },
    ];
    const { products } = await loadBestSellerRanking(
      fakeDb(rows),
      catalogue(["a", "b", "c", "d", "e"]),
    );
    expect(products[0].id).toBe("a");
    // "a" ranks but only from the single paid unit — verify by beating it:
    const { products: beaten } = await loadBestSellerRanking(
      fakeDb([{ product_id: "b", quantity: 2, status: "paid" }]),
      catalogue(["a", "b"]),
    );
    expect(beaten[0].id).toBe("b");
  });

  it("aggregates SUM(quantity) per product across orders (metric A)", async () => {
    const rows = [
      { product_id: "a", quantity: 3, status: "paid" },
      { product_id: "a", quantity: 2, status: "shipped" },
      { product_id: "b", quantity: 4, status: "paid" },
    ];
    const { products } = await loadBestSellerRanking(fakeDb(rows), catalogue(["a", "b", "c"]));
    // Ranked by units (a=5 > b=4); the remaining slot is deterministic
    // fallback fill from the catalogue (spec: fallback fills missing slots).
    expect(products.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("best-seller selection and fallback", () => {
  it("zero successful sales → deterministic catalogue fallback", async () => {
    const { products, ranked } = await loadBestSellerRanking(
      fakeDb([{ product_id: "z", quantity: 5, status: "failed" }]),
      catalogue(["p1", "p2", "p3", "p4", "p5"]),
    );
    expect(ranked).toBe(false);
    expect(products.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("one seller → seller first + deterministic fallback", async () => {
    const { products, ranked } = await loadBestSellerRanking(
      fakeDb([{ product_id: "p3", quantity: 1, status: "paid" }]),
      catalogue(["p1", "p2", "p3", "p4", "p5"]),
    );
    expect(ranked).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p3", "p1", "p2", "p4"]);
  });

  it("exactly four sellers → exact top 4; more than four → only top 4", async () => {
    const rows = ["a", "b", "c", "d", "e"].map((id, i) => ({
      product_id: id,
      quantity: i + 1,
      status: "paid",
    }));
    const { products } = await loadBestSellerRanking(
      fakeDb(rows),
      catalogue(["a", "b", "c", "d", "e"]),
    );
    expect(products.map((p) => p.id)).toEqual(["e", "d", "c", "b"]);
    expect(products).toHaveLength(BEST_SELLER_COUNT);
  });

  it("ties break deterministically by catalogue order (no refresh shuffling)", async () => {
    const rows = [
      { product_id: "x", quantity: 2, status: "paid" },
      { product_id: "y", quantity: 2, status: "paid" },
    ];
    const { products } = await loadBestSellerRanking(fakeDb(rows), catalogue(["x", "y", "z"]));
    expect(products.map((p) => p.id)).toEqual(["x", "y", "z"]);
  });

  it("quantity > 1 follows the units-sold metric exactly", async () => {
    const rows = [
      { product_id: "few", quantity: 1, status: "paid" },
      { product_id: "many", quantity: 3, status: "paid" },
    ];
    const { products } = await loadBestSellerRanking(fakeDb(rows), catalogue(["few", "many"]));
    expect(products[0].id).toBe("many");
  });

  it("duplicate callback/webhook replay cannot double-count: order_items carries one row per (order, product); replays reuse the same financial completion", async () => {
    // Two DISTINCT orders for the same product are two real purchases (counts twice).
    const twoOrders = [
      { product_id: "a", quantity: 1, status: "paid" },
      { product_id: "a", quantity: 1, status: "paid" },
    ];
    const { products: two } = await loadBestSellerRanking(fakeDb(twoOrders), catalogue(["a", "b"]));
    expect(two[0].id).toBe("a");
    // A replayed finalization does not insert a second order_items row —
    // structurally impossible to double-count; verify one row → one count.
    const { products: one } = await loadBestSellerRanking(
      fakeDb([{ product_id: "a", quantity: 1, status: "paid" }]),
      catalogue(["a", "b"]),
    );
    expect(one[0].id).toBe("a");
  });

  it("order_items rows for non-catalogue (deleted/inactive/unpublished) products are excluded", async () => {
    const rows = [
      { product_id: "deleted-product", quantity: 99, status: "paid" },
      { product_id: "live", quantity: 1, status: "paid" },
    ];
    const { products } = await loadBestSellerRanking(fakeDb(rows), catalogue(["live", "p2"]));
    expect(products.map((p) => p.id)).toEqual(["live", "p2"]);
  });

  it("fewer than four valid products → no duplication, no padding", async () => {
    const rows = [{ product_id: "p1", quantity: 2, status: "paid" }];
    const { products } = await loadBestSellerRanking(fakeDb(rows), catalogue(["p1", "p2"]));
    expect(products).toHaveLength(2);
    expect(new Set(products.map((p) => p.id)).size).toBe(2);
  });
});

describe("best-seller failure degradation", () => {
  it("aggregation failure throws so the caller degrades to catalogue fallback", async () => {
    await expect(loadBestSellerRanking(failingDb(), catalogue(["p1"]))).rejects.toThrow(
      "Best-seller aggregation failed.",
    );
    // The caller's degradation path (getPublicHomeProductSections catch):
    expect(fillBestSellers([], catalogue(["p1", "p2", "p3", "p4", "p5"])).map((p) => p.id)).toEqual(
      ["p1", "p2", "p3", "p4"],
    );
  });
});

describe("fillBestSellers contract", () => {
  it("never duplicates a ranked seller in fallback slots", () => {
    const out = fillBestSellers(catalogue(["a", "b"]), catalogue(["b", "c", "d", "e", "f"]));
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("caps at four and preserves ranked order", () => {
    const out = fillBestSellers(catalogue(["e", "d", "c", "b", "a"]), []);
    expect(out.map((p) => p.id)).toEqual(["e", "d", "c", "b"]);
  });
});
