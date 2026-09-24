import { describe, expect, it } from "vitest";
import {
  RESILIENCE_COPY,
  createLkgCache,
  failureCopy,
  isNetworkError,
  resolveSection,
} from "../src/lib/public-resilience";

describe("resolveSection — truthful data states", () => {
  it("data present with no failure is loaded", () => {
    expect(resolveSection([1, 2], false)).toEqual({ status: "loaded", items: [1, 2] });
  });

  it("data present with a failure keeps data visible as stale (last-known-good)", () => {
    const result = resolveSection(["p1"], true);
    expect(result.status).toBe("stale");
    expect(result.items).toEqual(["p1"]);
  });

  it("no data with a failure is an error — never a legitimate empty state", () => {
    expect(resolveSection([], true).status).toBe("error");
  });

  it("no data with no failure is a real empty catalogue", () => {
    expect(resolveSection([], false).status).toBe("empty");
  });
});

describe("error classification and truthful copy", () => {
  it("classifies fetch/network failures as network errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("network timeout"))).toBe(true);
    expect(isNetworkError(Object.assign(new Error("boom"), { name: "AbortError" }))).toBe(true);
  });

  it("classifies server/database failures as not-network", () => {
    expect(isNetworkError(new Error("Unable to load orders. Please retry."))).toBe(false);
    expect(isNetworkError(new Error("Database unavailable"))).toBe(false);
  });

  it("network failures get connection copy, not service-outage language", () => {
    expect(failureCopy(new TypeError("Failed to fetch"))).toBe(RESILIENCE_COPY.unableToConnect);
    expect(failureCopy(new TypeError("Failed to fetch"))).not.toContain("unavailable");
  });

  it("server failures get neutral content-unavailable copy", () => {
    expect(failureCopy(new Error("db down"))).toBe(RESILIENCE_COPY.contentUnavailable);
  });
});

describe("last-known-good cache", () => {
  it("returns cached value for the same query key", () => {
    const cache = createLkgCache<string>();
    cache.set("q=monitor|page=1", "v1");
    expect(cache.get("q=monitor|page=1")).toBe("v1");
    expect(cache.get("q=other")).toBeUndefined();
  });

  it("evicts the oldest entry beyond the bound", () => {
    const cache = createLkgCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("refreshing a key refreshes its recency", () => {
    const cache = createLkgCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 9); // refresh a
    cache.set("c", 3); // evicts b, not a
    expect(cache.get("a")).toBe(9);
    expect(cache.get("b")).toBeUndefined();
  });
});

describe("public copy semantics", () => {
  it("stale copy never claims content is unavailable", () => {
    expect(RESILIENCE_COPY.stale).toMatch(/latest available content/i);
    expect(RESILIENCE_COPY.stale).not.toMatch(/unavailable/i);
  });

  it("search failure copy is connection-scoped, not product-scoped", () => {
    expect(RESILIENCE_COPY.searchUnavailable).toMatch(/connection/i);
    expect(RESILIENCE_COPY.searchUnavailable).not.toMatch(/products/i);
  });
});
