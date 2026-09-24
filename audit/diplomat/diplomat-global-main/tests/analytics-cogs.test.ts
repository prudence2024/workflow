import { describe, expect, it } from "vitest";
import { summarizeCogs } from "@/lib/analytics-cogs";

describe("summarizeCogs — truthful cost-data semantics", () => {
  it("treats NULL cost as unknown (excluded from COGS, counted as without-cost)", () => {
    const s = summarizeCogs([
      { quantity: 2, cost_price: null },
      { quantity: 3, cost_price: "1500.00" },
    ]);
    expect(s.cogsTotal).toBe(4500);
    expect(s.itemsWithCost).toBe(3);
    expect(s.itemsWithoutCost).toBe(2);
    expect(s.hasCompleteData).toBe(false);
    expect(s.costDataAvailable).toBe(true);
  });

  it("treats explicit 0 as a KNOWN cost (contributes zero, not unknown)", () => {
    const s = summarizeCogs([{ quantity: 4, cost_price: 0 }]);
    expect(s.cogsTotal).toBe(0);
    expect(s.itemsWithCost).toBe(4);
    expect(s.itemsWithoutCost).toBe(0);
    expect(s.hasCompleteData).toBe(true);
    expect(s.costDataAvailable).toBe(true);
  });

  it("when NO item has any cost, costDataAvailable=false → UI must not fabricate margin", () => {
    const s = summarizeCogs([
      { quantity: 1, cost_price: null },
      { quantity: 2, cost_price: null },
    ]);
    expect(s.cogsTotal).toBe(0);
    expect(s.hasCompleteData).toBe(false);
    expect(s.costDataAvailable).toBe(false);
  });

  it("empty period has no cost data available", () => {
    const s = summarizeCogs([]);
    expect(s.cogsTotal).toBe(0);
    expect(s.hasCompleteData).toBe(true);
    expect(s.costDataAvailable).toBe(false);
  });

  it("handles numeric-string cost_price from the driver", () => {
    const s = summarizeCogs([{ quantity: "2", cost_price: "1250.50" }]);
    expect(s.cogsTotal).toBeCloseTo(2501);
    expect(s.costDataAvailable).toBe(true);
  });

  it("NaN cost falls back to unknown rather than poisoning the total", () => {
    const s = summarizeCogs([{ quantity: 1, cost_price: "abc" }]);
    expect(s.cogsTotal).toBe(0);
    expect(s.itemsWithoutCost).toBe(1);
    expect(s.costDataAvailable).toBe(false);
  });
});
