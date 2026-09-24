import { describe, expect, it, vi } from "vitest";
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: async () => ({ userId: "user-owner" }),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        firstName: "Ada",
        lastName: "Okoro",
        emailAddresses: [{ emailAddress: "wrong.name@example.com" }],
      }),
    },
  }),
}));
import { resolveAuditActor } from "../src/lib/admin/admin-ops.server";

describe("session actor identity", () => {
  it("uses explicit Clerk profile name and admin role, not email", async () => {
    const lookups: unknown[] = [];
    const db = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: (field: string, value: string) => {
            lookups.push([table, field, value]);
            return query;
          },
          maybeSingle: async () => ({
            data: table === "admin_users" ? { id: "admin-1", role_id: "role-1" } : { key: "owner" },
          }),
        };
        return query;
      },
    };
    expect(
      await resolveAuditActor(db as Parameters<typeof resolveAuditActor>[0], "user-owner"),
    ).toEqual({ adminId: "admin-1", displayName: "Ada Okoro", role: "owner" });
    expect(lookups).toEqual([
      ["admin_users", "clerk_user_id", "user-owner"],
      ["roles", "id", "role-1"],
    ]);
  });
});
