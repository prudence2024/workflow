import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("campaign detail route resolution", () => {
  const page = read("src/app/(app)/campaigns/[id]/page.tsx");
  const actions = read("src/app/(app)/campaigns/actions.ts");
  const service = read("src/lib/campaignRun.ts");
  const button = read("src/components/campaigns/RunCampaignButton.tsx");

  it("awaits Next 16 route params before the tenant-scoped lookup", () => {
    expect(page).toContain("params: Promise<{ id: string }>");
    expect(page).toContain("const { id } = await params");
    expect(page.indexOf("const { id } = await params")).toBeLessThan(page.indexOf("getCampaignDetail({ user, org }, id"));
  });

  it("keeps the 404 branch after the authorized campaign lookup", () => {
    const lookup = page.indexOf("getCampaignDetail({ user, org }, id");
    const notFound = page.indexOf("notFound();", lookup);
    expect(lookup).toBeGreaterThan(-1);
    expect(notFound).toBeGreaterThan(lookup);
    expect(page).toContain("campaignFound=");
    expect(page).toContain("[campaign-route] not found");
  });

  it("keeps server-action entry and campaign ownership scoped", () => {
    const run = actions.slice(actions.indexOf("export async function runCampaignAction"));
    expect(run).toContain("[campaign-action] run entry");
    expect(run).toContain("startCampaignRun({ user, org }, campaignId)");
    expect(service).toContain("where id = ${campaignId}::uuid and org_id = ${workspace.org.orgId}::uuid");
    expect(service).toContain("for update");
  });

  it("uses the authenticated API route instead of the flaky Server Action form", () => {
    expect(page).toContain("<RunCampaignButton campaignId={id}");
    expect(button).toContain("/api/campaigns/${encodeURIComponent(campaignId)}/run");
    expect(button).toContain('method: "POST"');
    expect(button).toContain('type="button"');
  });

  it("guards duplicate clicks and restores actionable UI after failure", () => {
    expect(button).toContain("busyRef.current = true");
    expect(button).toContain("busyRef.current = false");
    expect(button).toContain("state === \"pending\"");
    expect(button).toContain("Queue request timed out.");
  });
});
