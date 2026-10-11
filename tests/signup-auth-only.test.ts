import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signupPage = readFileSync(new URL("../src/app/(auth)/signup/page.tsx", import.meta.url), "utf8");
const authActions = readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
const signupAction = authActions.split("const loginSchema")[0];
const authShell = readFileSync(new URL("../src/components/auth/AuthShell.tsx", import.meta.url), "utf8");

describe("signup auth-only contract", () => {
  it("uses the Clerk-backed auth-only signup surface", () => {
    expect(signupPage).toContain('from "@clerk/nextjs"');
    expect(signupPage).toContain("<SignUp");
    expect(signupPage).not.toContain("AuthOnlySignup");
    expect(signupPage).toContain('routing="hash"');
    expect(signupPage).toContain("/auth/complete");
  });

  it("does not render onboarding/profile fields on initial signup", () => {
    for (const forbidden of [
      "first name",
      "last name",
      "phone number",
      "organization name",
      "workspace name",
      "select a plan",
    ]) {
      expect(signupPage.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("keeps the legacy development bridge identity-only", () => {
    expect(signupAction).toContain('formData.get("email")');
    expect(signupAction).toContain('formData.get("password")');
    expect(signupAction).not.toContain('formData.get("name")');
    expect(signupAction).not.toContain('formData.get("organization")');
    expect(signupAction).toContain('redirect("/onboarding?step=workspace")');
    expect(signupAction).not.toContain('redirect("/dashboard")');
  });

  it("does not send auth-shell branding to the marketing homepage", () => {
    expect(authShell).toContain('logoHref = "/login"');
    expect(authShell).toContain("BrandLockup href={logoHref}");
  });
});
