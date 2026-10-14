import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { importedCustomFields, parseSpreadsheet } from "@/lib/spreadsheet";
import { validatePrequeueContact } from "@/lib/prequeueValidation";

describe("imported custom field mapping", () => {
  it("derives a generic Course option without hardcoding the column name", () => {
    expect(importedCustomFields(["First Name", "Email", "Course", "Source"])).toEqual([
      { key: "custom_course", label: "Course", column: "Course" },
      { key: "custom_source", label: "Source", column: "Source" },
    ]);
  });

  it("preserves Course=Workflow Basics for all five synthetic records", () => {
    const parsed = parseSpreadsheet(readFileSync("tests/fixtures/form-automation-synthetic.csv"), "form-automation-synthetic.csv");
    const course = importedCustomFields(parsed.columns).find((field) => field.label === "Course");
    expect(course?.key).toBe("custom_course");
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows.map((row) => row[course!.column])).toEqual(Array(5).fill("Workflow Basics"));
  });

  it("resolves custom values alongside standard contact fields", () => {
    const result = validatePrequeueContact({
      firstName: "Ada",
      lastName: "Example",
      email: "ada@example.com",
      phone: "+2348000000001",
      company: null,
      address: null,
      customFields: { course: "Workflow Basics" },
    }, [
      { name: "full_name", label: "Full Name", required: true },
      { name: "email", label: "Email", required: true },
      { name: "phone", label: "Phone", required: true },
      { name: "course", label: "Course", required: true },
    ], {
      full_name: "fullName",
      email: "email",
      phone: "phone",
      course: "custom__course",
    });
    expect(result).toEqual({ valid: true, missing: [] });
  });

  it("rejects missing required custom values before queueing", () => {
    expect(validatePrequeueContact({
      firstName: "Ada",
      lastName: "Example",
      email: "ada@example.com",
      phone: "+2348000000001",
      company: null,
      address: null,
      customFields: {},
    }, [{ name: "course", label: "Course", required: true }], { course: "custom__course" })).toEqual({
      valid: false,
      missing: ["Course"],
    });
  });

  it("keeps duplicate custom headers distinct and excludes reserved contact columns", () => {
    expect(importedCustomFields(["Email", "Course", "Course", "Company", "Lead Source"])).toEqual([
      { key: "custom_course", label: "Course", column: "Course" },
      { key: "custom_course_2", label: "Course", column: "Course" },
      { key: "custom_lead_source", label: "Lead Source", column: "Lead Source" },
    ]);
  });
});
