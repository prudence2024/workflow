import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("final product hardening contracts", () => {
  it("keeps theme initialization before the first visible paint", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("workflow-theme");
    expect(layout).toContain("document.documentElement");
    expect(layout).toContain("colorScheme");
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("keeps the first-run guide resumable and reachable from Help", () => {
    const guide = read("src/components/app/FirstRunGuide.tsx");
    const help = read("src/app/(app)/help/page.tsx");
    expect(guide).toContain("localStorage");
    expect(guide).toContain("Skip for now");
    expect(guide).toContain("Restart");
    expect(guide).toContain("Back");
    expect(guide).toContain("Finish");
    expect(guide).toContain("aria-current");
    expect(guide).toContain("ITEMS");
    expect(help).toContain("forceOpen showRestart");
  });

  it("protects archived campaigns and allows an explicit restore", () => {
    const actions = read("src/app/(app)/campaigns/actions.ts");
    const page = read("src/app/(app)/campaigns/[id]/page.tsx");
    expect(actions).toContain("Archived campaigns must be restored before they can run.");
    expect(actions).toContain("unarchiveCampaignAction");
    expect(page).toContain("campaign.status !== \"archived\"");
    expect(page).toContain("Restore");
    expect(page).toContain("STATUS_COPY");
  });

  it("enforces the custom-field capability in both UI and mutation", () => {
    const plans = read("src/lib/plans.ts");
    const actions = read("src/app/(app)/contacts/actions.ts");
    const page = read("src/app/(app)/settings/fields/page.tsx");
    expect(plans).toContain('"custom_fields"');
    expect(actions).toContain('assertPlanCapability(tx, org.orgId, "custom_fields")');
    expect(page).toContain("Custom fields require Pro");
    expect(page).toContain('href="/pricing"');
  });

  it("keeps the platform console owner-gated and operationally observable", () => {
    const auth = read("src/lib/authorization.ts");
    const admin = read("src/app/(app)/platform-admin/page.tsx");
    expect(auth).toContain("user_3KTFmoEUnXORTAvZDOYIfYw0Ga7");
    expect(auth).toContain("emailVerified");
    expect(admin).toContain("requireWorkflowAdminOwner");
    expect(admin).toContain("Provider readiness");
    expect(admin).toContain("Campaign queue");
    expect(admin).toContain("workspaceSearch");
  });

  it("keeps note mutations tenant-scoped", () => {
    const actions = read("src/app/(app)/contacts/actions.ts");
    expect(actions).toContain("updateNoteAction");
    expect(actions).toContain("deleteNoteAction");
    expect(actions).toContain("eq(notes.orgId, org.orgId)");
  });

  it("uses the supplied horizontal asset for social metadata and the complete app tile for install UI", () => {
    const layout = read("src/app/layout.tsx");
    const pwa = read("src/components/pwa/PwaRuntime.tsx");
    const css = read("src/app/globals.css");
    expect(layout).toContain("/branding/workflow-social-preview.png");
    expect(layout).toContain("alternates: { canonical: \"/\" }");
    expect(layout).not.toContain("/branding/workflow-logo-light.png");
    expect(pwa).toContain("/icons/workflow-app-192.png");
    expect(css).toContain("pwa-install-enter");
    expect(css).toContain("prefers-reduced-motion");
  });
});
