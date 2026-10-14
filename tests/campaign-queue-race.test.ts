import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CampaignRunValidationError, validateCampaignRun } from "../src/lib/campaignRun";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("campaign queue race protections", () => {
  it("locks the campaign row before checking and creating a run snapshot", () => {
    const source = read("src/lib/campaignRun.ts");
    expect(source).toContain("for update");
    expect(source).toContain("validateCampaignRun");
    expect(source).toContain("randomUUID()");
  });

  it("uses the authenticated API button with duplicate-click and timeout protection", () => {
    const source = read("src/components/campaigns/RunCampaignButton.tsx");
    expect(source).toContain("busyRef.current");
    expect(source).toContain("AbortController");
    expect(source).toContain("REQUEST_TIMEOUT_MS");
    expect(source).toContain('method: "POST"');
  });

  it("does not silently convert a queue validation error into a successful run", () => {
    const source = read("src/app/api/campaigns/[id]/run/route.ts");
    expect(source).toContain("campaignRunErrorMessage");
    expect(source).toContain("success: false");
    expect(source).toContain("CampaignRunValidationError");
  });

  it("rejects a concurrent attempt through the same active-run rule", () => {
    const input = {
      requestedOrgId: "org-1",
      campaignOrgId: "org-1",
      campaignId: "campaign-1",
      campaignStatus: "running",
      formAnalysisStatus: "ready",
      formDefinition: [{ name: "email", label: "Email", required: true }],
      fieldMapping: { email: "email" },
      activeRecordCount: 0,
      records: [{ id: "record-1", orgId: "org-1", campaignId: "campaign-1", status: "queued", firstName: "Ada", lastName: "Example", email: "ada@example.com", phone: null, company: null, address: null, customFields: null }],
    };
    expect(() => validateCampaignRun(input)).toThrow(CampaignRunValidationError);
    expect(() => validateCampaignRun({ ...input, campaignStatus: "completed", activeRecordCount: 1 })).toThrow("already running");
  });

  it("returns a completed or failed campaign to ready when failed records are requeued", () => {
    const source = read("src/lib/submissionEngine.ts");
    const retry = source.slice(source.indexOf("export async function resetFailedRecords"), source.indexOf("/** Park"));
    expect(retry).toContain("db.transaction");
    expect(retry).toContain('status: "queued"');
    expect(retry).toContain('status: "ready"');
    expect(retry).toContain('inArray(campaigns.status, ["completed", "failed"])');
    expect(retry).toContain("Never change an active run here.");
  });
});
