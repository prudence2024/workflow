import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("campaign resource guardrails", () => {
  it("bounds campaign detail records and related collections", () => {
    const source = read("src/lib/data.ts");
    const detail = source.slice(source.indexOf("export async function getCampaignDetail"), source.indexOf("/** Lightweight status read"));
    expect(detail).toContain("recordsPageSize");
    expect(detail).toContain("limit ${recordsPageSize} offset ${recordsOffset}");
    expect(detail).toContain("select count(*)::int as total");
    expect(detail).toContain("limit 50");
    expect(detail).toContain("limit 100");
    expect(detail).toContain("Object.entries(c.field_mapping ?? {}).slice(0, 100)");
  });

  it("uses server-side search and pagination for add-contacts", () => {
    const source = read("src/lib/data.ts");
    const audience = source.slice(source.indexOf("export async function getCampaignAudienceCandidates"), source.indexOf("export type CampaignImportBatch"));
    expect(audience).toContain("options: { page?: number; pageSize?: number; search?: string }");
    expect(audience).toContain("ilike");
    expect(audience).toContain("select count(*)::int as total");
    expect(audience).toContain("limit ${pageSize} offset ${offset}");
  });

  it("keeps bulk add operations set-based and caps checkbox submissions", () => {
    const source = read("src/app/(app)/campaigns/actions.ts");
    const action = source.slice(source.indexOf("export async function addContactsToCampaignAction"), source.indexOf("export async function runCampaignAction"));
    expect(action).toContain("insert into public.campaign_records");
    expect(action).toContain("select ${org.orgId}::uuid, ${campaignId}::uuid, c.id, 'queued'");
    expect(action).toContain("slice(0, 1000)");
    expect(action).not.toContain("tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.orgId");
  });

  it("polls a small status API instead of refreshing the full RSC repeatedly", () => {
    const refresh = read("src/components/runtime/CampaignStatusRefresh.tsx");
    const route = read("src/app/api/campaigns/[id]/status/route.ts");
    expect(refresh).toContain("/api/campaigns/${campaignId}/status");
    expect(refresh).toContain("cache: \"no-store\"");
    expect(refresh).toContain("window.setInterval(() => void poll(), 5000)");
    expect(refresh).not.toContain("window.setInterval(refresh, 4000)");
    expect(route).toContain("getCampaignStatus");
    expect(route).toContain("private, no-store");
  });

  it("bounds contact detail history and tag collections", () => {
    const source = read("src/lib/data.ts");
    const detail = source.slice(source.indexOf("export async function getContactDetail"));
    expect(detail).toContain("where cr.contact_id = ${contactId}::uuid");
    expect(detail).toContain("limit 50");
    expect(detail).toContain("select id, name from public.tags order by name limit 100");
  });
});
