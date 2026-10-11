import { describe, expect, it } from "vitest";
import { isWorkflowAdminOwner } from "@/lib/authorization";

const owner = {
  clerkUserId: "user_3KTFmoEUnXORTAvZDOYIfYw0Ga7",
  email: "okwuborprudence@gmail.com",
  emailVerified: true,
};

describe("owner-only admin authorization", () => {
  it("accepts only the exact verified owner identity", () => {
    expect(isWorkflowAdminOwner(owner)).toBe(true);
    expect(isWorkflowAdminOwner({ ...owner, email: "OKWUBORPRUDENCE@GMAIL.COM" })).toBe(true);
  });

  it("rejects a different Clerk subject, email, or unverified email", () => {
    expect(isWorkflowAdminOwner({ ...owner, clerkUserId: "user_other" })).toBe(false);
    expect(isWorkflowAdminOwner({ ...owner, email: "other@example.com" })).toBe(false);
    expect(isWorkflowAdminOwner({ ...owner, emailVerified: false })).toBe(false);
  });

  it("rejects legacy identities even when their database flag is set", () => {
    expect(isWorkflowAdminOwner({ ...owner, clerkUserId: null })).toBe(false);
  });
});
