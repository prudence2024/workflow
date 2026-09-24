import { describe, expect, it, vi } from "vitest";
import { createCoalescedRefresh, shouldRefresh } from "../src/lib/refresh-coalescer";
import { NO_ROLE_LABEL, formatAdminRoleLabel } from "../src/lib/admin/role-label";
import { describeLoadFailure, serverFnFailure } from "../src/lib/admin/load-failure";

describe("refresh coalescer — duplicate admin shell fetches", () => {
  it("collapses the mount+focus+visibilitychange burst into ONE run", async () => {
    const clock = 1_000;
    const run = vi.fn().mockResolvedValue("ok");
    const scheduler = createCoalescedRefresh({ run, minIntervalMs: 5_000, now: () => clock });

    // Returning to a tab fires focus AND visibilitychange (plus mount) ~together.
    await Promise.all([scheduler.request(), scheduler.request(), scheduler.request()]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("still refreshes after the quiet window elapses", async () => {
    let clock = 1_000;
    const run = vi.fn().mockResolvedValue("ok");
    const scheduler = createCoalescedRefresh({ run, minIntervalMs: 5_000, now: () => clock });

    await scheduler.request();
    clock += 1_000; // second trigger inside the window
    await scheduler.request();
    expect(run).toHaveBeenCalledTimes(1);

    clock += 5_000; // genuine later return to the tab
    await scheduler.request();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("joins an in-flight run instead of starting a parallel one", async () => {
    let resolveRun: (v: unknown) => void = () => {};
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    const scheduler = createCoalescedRefresh({ run, minIntervalMs: 0 });
    const first = scheduler.request();
    const second = scheduler.request();
    // Runs are deferred one microtask so a render-pass request never fires
    // synchronously; the second call already joined the in-flight promise.
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.isPending()).toBe(true);
    resolveRun("done");
    await Promise.all([first, second]);
    expect(scheduler.isPending()).toBe(false);
  });

  it("reset() allows an explicit user action to bypass the window", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const scheduler = createCoalescedRefresh({ run, minIntervalMs: 60_000 });
    await scheduler.request();
    await scheduler.request();
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.reset();
    await scheduler.request();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("shouldRefresh is false only inside the window", () => {
    expect(shouldRefresh(null, 1_000, 5_000)).toBe(true);
    expect(shouldRefresh(1_000, 5_999, 5_000)).toBe(false);
    expect(shouldRefresh(1_000, 6_000, 5_000)).toBe(true);
  });
});

describe("admin role label — UI must not claim a role the server did not grant", () => {
  it("labels the server-resolved key", () => {
    expect(formatAdminRoleLabel("owner")).toBe("Owner");
    expect(formatAdminRoleLabel("editor")).toBe("Editor");
    expect(formatAdminRoleLabel("OWNER")).toBe("Owner");
  });

  it("says so explicitly when no role is resolved", () => {
    expect(formatAdminRoleLabel(null)).toBe(NO_ROLE_LABEL);
    expect(formatAdminRoleLabel(undefined)).toBe(NO_ROLE_LABEL);
    expect(formatAdminRoleLabel("")).toBe(NO_ROLE_LABEL);
    expect(formatAdminRoleLabel("   ")).toBe(NO_ROLE_LABEL);
  });
});

describe("analytics load failures are truthful, never an infinite spinner", () => {
  it("names a permission denial as such", () => {
    expect(describeLoadFailure(new Error("Missing permission: analytics.view"))).toBe(
      "Your role does not include permission to view analytics.",
    );
  });

  it("passes through a real error message", () => {
    expect(describeLoadFailure(new Error("Sales analytics query failed"))).toBe(
      "Sales analytics query failed",
    );
  });

  it("still produces a readable reason for empty/unknown rejections", () => {
    expect(describeLoadFailure(undefined)).toBe("Analytics could not be loaded.");
    expect(describeLoadFailure({})).toBe("Analytics could not be loaded.");
    expect(describeLoadFailure("x".repeat(500)).length).toBe(200);
  });

  it("detects a RETURNED serverFn failure (denied serverFns do not throw)", () => {
    // Real shape from adminGetSalesAnalytics / adminGetDashboardStats on denial.
    expect(serverFnFailure({ data: null, error: "Missing permission: analytics.view" })).toBe(
      "Missing permission: analytics.view",
    );
    expect(serverFnFailure({ ok: false, message: "Query failed" })).toBe("Query failed");
  });

  it("does not treat successful payloads as failures", () => {
    expect(serverFnFailure({ data: { grossSales: 1 } })).toBeNull();
    expect(serverFnFailure({ stats: { totalOrders: 3 } })).toBeNull();
    expect(serverFnFailure(null)).toBeNull();
    expect(serverFnFailure(undefined)).toBeNull();
    // ok:true with an informational message is NOT a failure.
    expect(serverFnFailure({ ok: true, message: "Saved" })).toBeNull();
  });
});
