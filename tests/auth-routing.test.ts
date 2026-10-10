import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePostAuthRoute } from "../src/lib/postAuthRouting";

const authCompletePage = readFileSync(new URL("../src/app/auth/complete/page.tsx", import.meta.url), "utf8");
const onboardingPage = readFileSync(new URL("../src/app/onboarding/page.tsx", import.meta.url), "utf8");
const appLayout = readFileSync(new URL("../src/app/(app)/layout.tsx", import.meta.url), "utf8");

describe("post-auth routing", () => {
  it("keeps unauthenticated requests on login", () => {
    expect(resolvePostAuthRoute({ authenticated: false, hasPendingInvitation: false, hasWorkspace: false })).toBe("/login");
  });

  it("routes an authenticated user without a workspace into onboarding", () => {
    expect(resolvePostAuthRoute({ authenticated: true, hasPendingInvitation: false, hasWorkspace: false })).toBe("/onboarding?step=workspace");
  });

  it("keeps invitations in the existing invitation-aware onboarding surface", () => {
    expect(resolvePostAuthRoute({ authenticated: true, hasPendingInvitation: true, hasWorkspace: false })).toBe("/onboarding?step=workspace");
  });

  it("routes an existing workspace member to the dashboard", () => {
    expect(resolvePostAuthRoute({ authenticated: true, hasPendingInvitation: false, hasWorkspace: true })).toBe("/dashboard");
  });

  it("does not reintroduce the profile-completion bounce before onboarding", () => {
    expect(authCompletePage).toContain('return "/onboarding"');
    expect(onboardingPage).toContain("First/last name fields are intentionally collected by the Details step.");
    expect(appLayout.indexOf('if (orgs.length === 0 || !currentOrg) redirect("/onboarding")')).toBeLessThan(
      appLayout.indexOf('if (!user.profileComplete) redirect("/profile-completion?next=/dashboard")'),
    );
  });
});
