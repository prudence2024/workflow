import { describe, expect, it } from "vitest";

import { resolveAdminRedirectTarget } from "../src/lib/admin/redirect-target";

/**
 * Contract for the post-login destination resolver.
 *
 * The admin login route previously navigated to a hardcoded "/dashboard",
 * which discarded a deep link whenever the session was re-established on the
 * login page (see the /dashboard/analytics bounce). It may now honor a
 * requested destination — so it must only ever return an internal path that
 * the caller is allowed to send the browser to.
 */
describe("resolveAdminRedirectTarget — safe post-login destination", () => {
  it("passes through an internal admin path", () => {
    expect(resolveAdminRedirectTarget("/dashboard/analytics")).toBe("/dashboard/analytics");
    expect(resolveAdminRedirectTarget("/dashboard/orders?status=paid")).toBe(
      "/dashboard/orders?status=paid",
    );
    expect(resolveAdminRedirectTarget("/dashboard/media#page-2")).toBe("/dashboard/media#page-2");
  });

  it("falls back to the dashboard for missing or non-string input", () => {
    expect(resolveAdminRedirectTarget(undefined)).toBe("/dashboard");
    expect(resolveAdminRedirectTarget(null)).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget(42)).toBe("/dashboard");
    expect(resolveAdminRedirectTarget({ href: "/dashboard/x" })).toBe("/dashboard");
  });

  it("rejects absolute and protocol-relative external destinations", () => {
    expect(resolveAdminRedirectTarget("https://evil.example/dashboard")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("http://evil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("//evil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("///evil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/\\evil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("\\\\evil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("dashboard/analytics")).toBe("/dashboard");
  });

  it("rejects encoded, scheme and control-character tricks", () => {
    expect(resolveAdminRedirectTarget("%2F%2Fevil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/%2Fevil.example")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("javascript:alert(1)")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/javascript:alert(1)")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/dashboard\u0000/analytics")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("   /dashboard/analytics   ")).toBe("/dashboard/analytics");
    expect(resolveAdminRedirectTarget("/" + "a".repeat(600))).toBe("/dashboard");
  });

  it("never returns a login or auth-boundary path (redirect-loop protection)", () => {
    expect(resolveAdminRedirectTarget("/admin/login")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/admin/login/$")).toBe("/dashboard");
    expect(resolveAdminRedirectTarget("/admin/login?redirect=/admin/login")).toBe("/dashboard");
  });
});
