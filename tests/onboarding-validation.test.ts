import { describe, expect, it } from "vitest";

import { parseWorkspaceInput } from "@/lib/workspaceValidation";

describe("onboarding workspace validation", () => {
  it("allows a personal workspace without an organization name", () => {
    expect(parseWorkspaceInput({ accountType: "personal", name: "", plan: "free" }).success).toBe(true);
  });

  it("requires a non-whitespace organization name", () => {
    expect(parseWorkspaceInput({ accountType: "organization", name: " ", plan: "free" }).success).toBe(false);
    expect(parseWorkspaceInput({ accountType: "organization", name: "Acme", plan: "free" }).success).toBe(true);
  });
});
