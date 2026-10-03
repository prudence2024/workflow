/**
 * Google question-text parsing (pure, no database, no browser).
 * Fixtures are the exact strings observed on the authorized test form.
 */
import { describe, expect, it } from "vitest";
import { parseGoogleQuestionText, providerForUrl } from "@/lib/formProviders";

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

  it("treats questions without an asterisk as optional", () => {
    expect(parseGoogleQuestionText("Nickname Your answer", 1)).toEqual({
      label: "Nickname Your answer".slice(0, 80),
      required: false,
    });
  });

  it("falls back to a positional label for empty text", () => {
    expect(parseGoogleQuestionText("   ", 2).label).toBe("Question 3");
  });
});
