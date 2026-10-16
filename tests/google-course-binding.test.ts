import { describe, expect, it } from "vitest";
import { parseGoogleQuestionText } from "../src/lib/formProviders";
import { buildMappingPreview, buildSubmissionValues } from "../scripts/form-worker-payload.mjs";

const contact = { first_name: "Ada", last_name: "Example", email: "ada@example.test", custom_fields: { custom_course: "Workflow Basics" } };
const field = { name: "course", label: "Course", type: "text", required: false };

describe("Google Course extraction and binding", () => {
  it("identifies optional and required Course exactly", () => {
    expect(parseGoogleQuestionText("Course Your answer", 0)).toMatchObject({ label: "Course", required: false });
    expect(parseGoogleQuestionText("Course *Your answer", 0)).toMatchObject({ label: "Course", required: true });
  });

  it("renders the mapped custom value in the mapping preview", () => {
    expect(buildMappingPreview([field], { course: "custom__custom_course" }, contact)).toEqual([{ label: "Course", required: false, mappedKey: "custom__custom_course", value: "Workflow Basics" }]);
  });

  it("builds the final submission payload with the dynamic Course value", () => {
    expect(buildSubmissionValues([{ ...field, required: true }], { course: "custom__custom_course" }, contact)).toEqual({ values: { course: "Workflow Basics" }, missing: [] });
  });

  it("blocks a missing required custom value", () => {
    expect(buildSubmissionValues([{ ...field, required: true }], { course: "custom__custom_course" }, { ...contact, custom_fields: {} })).toEqual({ values: {}, missing: ["Course"] });
  });
});
