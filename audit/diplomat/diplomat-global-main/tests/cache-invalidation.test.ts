import { describe, expect, it } from "vitest";
import { cached, invalidateCache, invalidateCachePrefix } from "../src/lib/cache.server";

/**
 * Behavioral proof of the per-instance cache semantics the public Blog reads
 * depend on: identical keys are computed once, invalidateCache clears one key,
 * invalidateCachePrefix clears every matching key (the mechanism the blog
 * create/update/delete mutations call). DB-backed behaviour and the
 * authenticated admin browser leg are covered separately
 * (PENDING_OWNER_SESSION for the latter — no synthetic rows in shared DB).
 */
describe("public read cache + invalidation", () => {
  it("serves the same key from cache without recomputing", async () => {
    let computeCount = 0;
    const read = () =>
      cached("test:blog:page1", 60_000, async () => {
        computeCount += 1;
        return { posts: ["A"] };
      });

    const first = await read();
    const second = await read();
    expect(computeCount).toBe(1);
    expect(second).toEqual(first);
    expect(second.posts).toEqual(["A"]);
  });

  it("invalidateCache forces the next read to recompute", async () => {
    let value = "A";
    const read = () =>
      cached("test:blog:invalidation", 60_000, async () => ({ state: value }));

    expect((await read()).state).toBe("A");
    value = "B"; // authoritative data changed
    expect((await read()).state).toBe("A"); // still cached — expected
    invalidateCache("test:blog:invalidation");
    expect((await read()).state).toBe("B"); // next public read is fresh
  });

  it("invalidateCachePrefix clears every page key (mutation coverage)", async () => {
    let rev = 0;
    const read = (page: number) =>
      cached(`test:blogpfx:${page}`, 60_000, async () => ({ rev }));

    await read(1);
    await read(2);
    rev = 1;
    invalidateCachePrefix("test:blogpfx:");
    expect((await read(1)).rev).toBe(1);
    expect((await read(2)).rev).toBe(1);
  });

  it("different TTL keys do not collide", async () => {
    const a = await cached("test:collide:a", 60_000, async () => ({ v: "a" }));
    const b = await cached("test:collide:b", 60_000, async () => ({ v: "b" }));
    expect(a).not.toEqual(b);
  });
});
