import { describe, expect, it, vi } from "vitest";
import { bestEffortCampaignActivity, CampaignRunValidationError, validateCampaignRun } from "../src/lib/campaignRun";

describe("campaign run API post-transition behavior", () => {
  it("preserves a successful transition when activity logging succeeds", async () => {
    const write = vi.fn(async () => undefined);
    const report = vi.fn();
    await bestEffortCampaignActivity({ write, report });
    expect(write).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });

  it("preserves a successful transition when secondary activity logging fails", async () => {
    const failure = new Error("activity unavailable");
    const report = vi.fn();
    await expect(bestEffortCampaignActivity({ write: async () => { throw failure; }, report })).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(failure);
  });

  it("keeps transition failures authoritative", () => {
    expect(() => validateCampaignRun({
      requestedOrgId: "org-1",
      campaignOrgId: "org-1",
      campaignId: "campaign-1",
      campaignStatus: "running",
      formAnalysisStatus: "ready",
      formDefinition: [{ name: "email", label: "Email", required: true }],
      fieldMapping: { email: "email" },
      activeRecordCount: 0,
      records: [{ id: "record-1", orgId: "org-1", campaignId: "campaign-1", status: "queued", firstName: "Ada", lastName: "Example", email: "ada@example.com", phone: null, company: null, address: null, customFields: null }],
    })).toThrow(CampaignRunValidationError);
  });
});
