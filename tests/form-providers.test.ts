/**
 * Google question-text parsing (pure, no database, no browser).
 * Fixtures are the exact strings observed on the authorized test form.
 */
import { describe, expect, it } from "vitest";
import { parseGoogleQuestionText, providerForUrl } from "@/lib/formProviders";
import { suggestMapping } from "@/lib/formAnalysis";

describe("provider routing", () => {
  it("routes Google Forms hosts to the google adapter", () => {
    expect(
      providerForUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLScE_Rv4XddC7BPn-vtYnG465MV41O5CkbdHFKjyUVsfjSXYrQ/viewform",
      ),
    ).toBe("google");
    expect(providerForUrl("https://example.com/form")).toBe("standard");
    expect(providerForUrl("not a url")).toBe("standard");
  });
});

describe("google question parsing", () => {
  it.each([
    ["Full Name *Your answer", "Full Name", true],
    ["Email Address *Your answer", "Email Address", true],
    ["Phone Number *Your answer", "Phone Number", true],
  ])("marks required question %s", (raw, label, required) => {
    expect(parseGoogleQuestionText(raw, 0)).toEqual({ label, required });
  });

  it("removes the Google helper text from optional questions", () => {
    expect(parseGoogleQuestionText("Nickname Your answer", 1)).toEqual({
      label: "Nickname",
      required: false,
    });
  });

  it("normalizes the optional Course question without broad text replacement", () => {
    expect(parseGoogleQuestionText("Course Your answer", 0)).toEqual({ label: "Course", required: false });
    expect(parseGoogleQuestionText("CourseYour answer", 0)).toEqual({ label: "Course", required: false });
    expect(parseGoogleQuestionText("Describe your answer", 0)).toEqual({ label: "Describe your answer", required: false });
  });

  it("normalizes required Course without losing required state", () => {
    expect(parseGoogleQuestionText("Course *Your answer", 0)).toEqual({ label: "Course", required: true });
  });

  it("falls back to a positional label for empty text", () => {
    expect(parseGoogleQuestionText("   ", 2).label).toBe("Question 3");
  });
});

describe("semantic field mapping", () => {
  it("maps common spreadsheet aliases without depending on column order", () => {
    expect(
      suggestMapping(
        ["mobile", "email_address", "surname", "given_name"],
        [
          { name: "firstName", label: "First name", type: "text", required: true },
          { name: "lastName", label: "Last name", type: "text", required: false },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "phone", required: false },
        ],
      ),
    ).toEqual({ firstName: "given_name", lastName: "surname", email: "email_address", phone: "mobile" });
  });
});
