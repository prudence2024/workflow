import { describe, expect, it } from "vitest";
import {
  decrementInventoryAtomic,
  confirmInventoryUpdate,
  getInventoryQuantity,
  getInventoryState,
  isProductAvailable,
  resolveInventoryPage,
  resolveInventoryState,
  shouldDecrementInventoryForFinalization,
  type InventoryDatabaseResult,
  type InventoryRow,
} from "../src/lib/inventory-lifecycle";

function result<T>(data: T | null): InventoryDatabaseResult<T> {
  return { data, error: null };
}

describe("inventory availability", () => {
  it("uses inventory quantity instead of the contradictory legacy flag", () => {
    expect(isProductAvailable({ quantity: 0 }, true)).toBe(false);
    expect(isProductAvailable({ quantity: 1 }, false)).toBe(true);
    expect(isProductAvailable({ quantity: 8 }, false)).toBe(true);
  });

  it("supports one-to-one relations returned as either a row or array", () => {
    expect(getInventoryQuantity({ quantity: 3 })).toBe(3);
    expect(getInventoryQuantity([{ quantity: 4 }])).toBe(4);
    expect(getInventoryQuantity([])).toBeNull();
    expect(isProductAvailable(null, true)).toBe(true);
  });

  it("distinguishes zero stock from low positive stock", () => {
    expect(getInventoryState(0, 5)).toBe("out_of_stock");
    expect(getInventoryState(1, 5)).toBe("low_stock");
    expect(getInventoryState(6, 5)).toBe("in_stock");
  });

  it("keeps a database failure distinct from a legitimate empty page", () => {
    const failed = resolveInventoryPage(
      { page: 1, pageSize: 10 },
      { data: null, count: null, error: { message: "database offline" } },
    );
    const empty = resolveInventoryPage(
      { page: 1, pageSize: 10 },
      { data: [], count: 0, error: null },
    );

    expect(failed).toMatchObject({ ok: false, items: [], total: 0 });
    expect(empty).toMatchObject({ ok: true, items: [], total: 0 });
  });

  it("requires an affected row before reporting an Admin update as successful", () => {
    expect(confirmInventoryUpdate(result<InventoryRow>(null))).toEqual({
      ok: false,
      message: "Inventory changed or no longer exists. Refresh and retry.",
    });
    expect(confirmInventoryUpdate(result({ quantity: 3 }))).toEqual({
      ok: true,
      inventory: { quantity: 3 },
    });
  });
});

describe("payment inventory decrement", () => {
  it("runs only for the request that wins the paid-order transition", () => {
    expect(
      shouldDecrementInventoryForFinalization({
        orderWasAlreadyPaid: false,
        orderClaimedByThisRequest: true,
      }),
    ).toBe(true);
    expect(
      shouldDecrementInventoryForFinalization({
        orderWasAlreadyPaid: true,
        orderClaimedByThisRequest: false,
      }),
    ).toBe(false);
    expect(
      shouldDecrementInventoryForFinalization({
        orderWasAlreadyPaid: false,
        orderClaimedByThisRequest: false,
      }),
    ).toBe(false);
  });

  it("decrements a successful claimed payment exactly once on retry", async () => {
    let stored = 2;
    const load = async () => result({ quantity: stored });
    const compareAndSwap = async ({ expectedQuantity, nextQuantity }) => {
      if (stored !== expectedQuantity) return result<InventoryRow>(null);
      stored = nextQuantity;
      return result({ quantity: stored });
    };

    const first = await decrementInventoryAtomic(1, load, compareAndSwap);
    const retryMayDecrement = shouldDecrementInventoryForFinalization({
      orderWasAlreadyPaid: true,
      orderClaimedByThisRequest: false,
    });

    expect(first).toEqual({ decremented: true, quantity: 1 });
    expect(retryMayDecrement).toBe(false);
    expect(stored).toBe(1);
  });

  it("allows only one customer to consume the final unit", async () => {
    let stored = 1;
    const load = async () => {
      const snapshot = stored;
      await Promise.resolve();
      return result({ quantity: snapshot });
    };
    const compareAndSwap = async ({ expectedQuantity, nextQuantity }) => {
      await Promise.resolve();
      if (stored !== expectedQuantity) return result<InventoryRow>(null);
      stored = nextQuantity;
      return result({ quantity: stored });
    };

    const outcomes = await Promise.all([
      decrementInventoryAtomic(1, load, compareAndSwap),
      decrementInventoryAtomic(1, load, compareAndSwap),
    ]);

    expect(outcomes.filter((outcome) => outcome.decremented)).toHaveLength(1);
    expect(
      outcomes.some((outcome) => !outcome.decremented && outcome.reason === "insufficient"),
    ).toBe(true);
    expect(stored).toBe(0);
  });

  it("preserves all decrements under contention without going negative", async () => {
    let stored = 5;
    const load = async () => result({ quantity: stored });
    const compareAndSwap = async ({ expectedQuantity, nextQuantity }) => {
      await Promise.resolve();
      if (stored !== expectedQuantity) return result<InventoryRow>(null);
      stored = nextQuantity;
      return result({ quantity: stored });
    };

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => decrementInventoryAtomic(1, load, compareAndSwap)),
    );

    expect(outcomes.filter((outcome) => outcome.decremented)).toHaveLength(5);
    expect(stored).toBe(0);
  });

  it("does not mutate inventory for failed payment paths", () => {
    expect(
      shouldDecrementInventoryForFinalization({
        orderWasAlreadyPaid: false,
        orderClaimedByThisRequest: false,
      }),
    ).toBe(false);
  });
});

describe("resolveInventoryState display mapping", () => {
  it("maps stock 10 to in stock", () => {
    const s = resolveInventoryState({ quantity: 10, low_stock_threshold: 5 }, true);
    expect(s).toEqual({ inStock: true, state: "in_stock", quantity: 10 });
  });

  it("maps stock 3 with threshold 3 to low stock (boundary inclusive)", () => {
    const s = resolveInventoryState({ quantity: 3, low_stock_threshold: 3 }, true);
    expect(s).toEqual({ inStock: true, state: "low_stock", quantity: 3 });
  });

  it("maps stock 0 to sold out regardless of the legacy flag", () => {
    const s = resolveInventoryState({ quantity: 0, low_stock_threshold: 5 }, true);
    expect(s).toEqual({ inStock: false, state: "out_of_stock", quantity: 0 });
  });

  it("applies the default threshold when the row has none", () => {
    const s = resolveInventoryState({ quantity: 5 }, true);
    expect(s.state).toBe("low_stock");
    expect(s.inStock).toBe(true);
  });

  it("falls back to the legacy flag when no inventory row exists", () => {
    expect(resolveInventoryState(null, true)).toEqual({
      inStock: true,
      state: "in_stock",
      quantity: null,
    });
    expect(resolveInventoryState(null, false).state).toBe("out_of_stock");
  });

  it("treats malformed inventory rows as missing (legacy fallback)", () => {
    expect(resolveInventoryState({ quantity: -2 }, true).quantity).toBeNull();
    expect(resolveInventoryState([{ quantity: 1.5 }], false).inStock).toBe(false);
  });
});
