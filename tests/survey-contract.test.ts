import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0023_product_surveys.sql"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "src/lib/surveys.ts"), "utf8");

describe("weekly survey storage contract", () => {
  it("stores one response per workspace, user, and seven-day period", () => {
    expect(migration).toContain('UNIQUE("org_id", "user_id", "period_start")');
    expect(repository).toContain("on conflict (org_id, user_id, period_start)");
  });

  it("keeps reads and writes tenant-scoped", () => {
    expect(migration).toContain("ALTER TABLE public.product_surveys ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.product_surveys FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (org_id = app.current_org_id())");
    expect(migration).toContain("WITH CHECK (org_id = app.current_org_id())");
    expect(repository).toContain("app.current_user_id()");
    expect(repository).toContain("inWorkspace(workspace");
  });

  it("records all requested feedback dimensions without provider or identity secrets", () => {
    for (const field of ["feature_used", "challenge", "bug_report", "requested_feature", "satisfaction", "would_recommend"]) {
      expect(migration).toContain(field);
    }
    expect(repository).not.toMatch(/secret|password|api[_-]?key/i);
  });
});
