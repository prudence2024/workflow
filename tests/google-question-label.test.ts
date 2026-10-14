import { describe, expect, it } from "vitest";
import { normalizeGoogleQuestionText } from "../scripts/google-question-label.mjs";

describe("Google Forms rendered question labels", () => {
  it("removes helper text and preserves required state", () => {
    expect(normalizeGoogleQuestionText("course", 0, "courseYour answer *")).toEqual({ label: "course", required: true });
  });

  it("preserves normal labels", () => {
    expect(normalizeGoogleQuestionText("Email Address", 0, "Email Address *Your answer")).toEqual({ label: "Email Address", required: true });
  });
});
