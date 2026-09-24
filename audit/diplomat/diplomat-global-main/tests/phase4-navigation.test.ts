import { describe, expect, it } from "vitest";
import { adminNavigationTarget } from "../src/lib/admin/navigation-target";

const id = "11111111-1111-4111-8111-111111111111";
describe("canonical admin destinations", () => {
  it.each(["orders", "transactions", "customers"])(
    "keeps exact %s detail and parses search separately",
    (entity) => {
      expect(adminNavigationTarget(`/dashboard/${entity}?detail=${id}`)).toEqual({
        to: `/dashboard/${entity}`,
        search: { detail: id },
      });
      expect(adminNavigationTarget(`/dashboard/${entity}/${id}`)?.to).toBe(
        `/dashboard/${entity}/${id}`,
      );
    },
  );
  it.each([
    "https://evil.test/dashboard/orders",
    "//evil.test",
    "javascript:alert(1)",
    "/dashboard/../shop",
    "/dashboard/orders?detail=garbage",
    "/dashboard/orders?redirect=https://evil.test",
    "/dashboard/orders#bad",
    "/dashboard/unknown",
    null,
  ])("rejects unsafe/unrecognized destination %s", (value) => {
    expect(adminNavigationTarget(value)).toBeNull();
  });
});
