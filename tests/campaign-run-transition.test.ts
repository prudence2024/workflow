import { describe, expect, it } from "vitest";
import { CampaignRunValidationError, validateCampaignRun, type CampaignRunRecord } from "../src/lib/campaignRun";

const record = (overrides: Partial<CampaignRunRecord> = {}): CampaignRunRecord => ({
  id: "record-1",
  orgId: "org-1",
  campaignId: "campaign-1",
  status: "queued",
  firstName: "Ada",
  lastName: "Example",
  email: "ada@example.com",
  phone: "+15550000001",
  company: null,
  address: null,
  customFields: { course: "Workflow Basics" },
  ...overrides,
});

const valid = (records = [record()]) => ({
  requestedOrgId: "org-1",
  campaignOrgId: "org-1",
  campaignId: "campaign-1",
  campaignStatus: "completed",
  formAnalysisStatus: "ready",
  formDefinition: [
    { name: "full_name", label: "Full Name", required: true },
    { name: "email", label: "Email", required: true },
  ],
  fieldMapping: { full_name: "fullName", email: "email" },
  activeRecordCount: 0,
  records,
});

describe("campaign run transition", () => {
  it("accepts a completed campaign with queued records", () => {
    expect(validateCampaignRun(valid([record({ status: "queued" })]))).toHaveLength(1);
  });

  it("rejects a campaign with no queued records", () => {
    expect(() => validateCampaignRun(valid([record({ status: "successful" })]))).toThrow("no queued records");
  });

  it("rejects active campaigns and active leases", () => {
    expect(() => validateCampaignRun({ ...valid(), campaignStatus: "running" })).toThrow(CampaignRunValidationError);
    expect(() => validateCampaignRun({ ...valid(), activeRecordCount: 1 })).toThrow("already running");
  });

  it("rejects workspace mismatches and missing required data", () => {
    expect(() => validateCampaignRun({ ...valid(), requestedOrgId: "other-org" })).toThrow("workspace");
    expect(() => validateCampaignRun(valid([record({ email: null })]))).toThrow("Email");
  });
});
