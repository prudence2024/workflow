import { describe, expect, it } from "vitest";

import { formatNgnPrice, NGN_PRICES } from "@/lib/pricing";

describe("NGN commercial pricing", () => {
  it("uses the owner-approved monthly values", () => {
    expect(NGN_PRICES).toEqual({
      free: 0,
      pro: 31_500,
      plus: 100_000,
    });
  });

  it("formats customer-facing prices using Nigerian locale grouping", () => {
    expect(formatNgnPrice("free")).toBe("₦0");
    expect(formatNgnPrice("pro")).toBe("₦31,500");
    expect(formatNgnPrice("plus")).toBe("₦100,000");
  });
});
