import { describe, expect, it } from "vitest";
import { buildCsv, buildWorkbook } from "@/lib/spreadsheet";

describe("contact export formats", () => {
  it("builds a UTF-8-safe CSV for empty and populated data", () => {
    const csv = buildCsv(["firstName", "custom.role"], [{ firstName: "Zoë", "custom.role": "Owner" }]);
    expect(csv).toContain("firstName,custom.role");
    expect(csv).toContain("Zoë");
    expect(buildCsv(["firstName"], [])).toContain("firstName");
  });

  it("builds an XLSX workbook even when there are no contacts", () => {
    const workbook = buildWorkbook("Contacts", ["firstName", "custom.role"], []);
    expect(workbook.byteLength).toBeGreaterThan(20);
    expect(workbook.subarray(0, 2).toString()).toBe("PK");
  });
});
