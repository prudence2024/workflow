import { describe, expect, it } from "vitest";
import { normalizeGoogleQuestionText } from "../scripts/google-question-label.mjs";

describe("Google Forms rendered question labels", () => {
  it("removes helper text and preserves required state", () => {
    expect(normalizeGoogleQuestionText("course", 0, "courseYour answer *")).toEqual({ label: "course", required: true });
  });

  it("preserves normal labels", () => {
    expect(normalizeGoogleQuestionText("Email Address", 0, "Email Address *Your answer")).toEqual({ label: "Email Address", required: true });
  });

  it("keeps the optional Course question exact when Google appends its answer affordance", () => {
    expect(normalizeGoogleQuestionText("Course Your answer", 0, "Course Your answer")).toEqual({ label: "Course", required: false });
    expect(normalizeGoogleQuestionText("CourseYour answer", 0, "CourseYour answer")).toEqual({ label: "Course", required: false });
  });

  it("preserves legitimate title text that contains lowercase helper words", () => {
    expect(normalizeGoogleQuestionText("Describe your answer", 0)).toEqual({ label: "Describe your answer", required: false });
  });

  it("strips a required marker and helper suffix while preserving Course", () => {
    expect(normalizeGoogleQuestionText("Course *Your answer", 0)).toEqual({ label: "Course", required: true });
  });
});
