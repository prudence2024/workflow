import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetInFlightForTests, inFlightCount, joinInFlight } from "../src/lib/in-flight-dedupe";

describe("joinInFlight — concurrent identical requests share one network call", () => {
  beforeEach(() => __resetInFlightForTests());

  it("runs the request once when two callers ask for the same key at the same time", async () => {
    let runs = 0;
    const run = vi.fn(async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 20));
      return "payload";
    });

    const [a, b] = await Promise.all([
      joinInFlight("receipts|1|", run),
      joinInFlight("receipts|1|", run),
    ]);

    expect(runs).toBe(1);
    expect(a).toBe("payload");
    expect(b).toBe("payload");
  });

  it("issues a real request again once the previous one settled", async () => {
    const run = vi.fn(async () => "ok");
    await joinInFlight("k", run);
    await joinInFlight("k", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never shares work between different keys", async () => {
    const run = vi.fn(async (v: string) => v);
    const [p1, p2] = await Promise.all([
      joinInFlight("page|1", () => run("one")),
      joinInFlight("page|2", () => run("two")),
    ]);
    expect([p1, p2]).toEqual(["one", "two"]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("clears the entry when the request rejects, so a retry is not swallowed", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(joinInFlight("k", failing)).rejects.toThrow("boom");
    expect(inFlightCount()).toBe(0);

    const ok = vi.fn(async () => "recovered");
    await expect(joinInFlight("k", ok)).resolves.toBe("recovered");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("reports zero in-flight entries when everything has settled", async () => {
    await joinInFlight("k", async () => 1);
    expect(inFlightCount()).toBe(0);
  });
});
