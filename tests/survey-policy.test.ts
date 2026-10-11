import { describe, expect, it } from "vitest";
import { isSurveyDue, periodStart, SURVEY_INTERVAL_MS } from "@/lib/surveyPolicy";

describe("weekly survey policy", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");

  it("does not prompt again before seven days", () => {
    expect(isSurveyDue(new Date(now.getTime() - SURVEY_INTERVAL_MS + 1), now)).toBe(false);
    expect(isSurveyDue(new Date(now.getTime() - SURVEY_INTERVAL_MS), now)).toBe(true);
  });

  it("prompts when no interaction has been stored", () => {
    expect(isSurveyDue(null, now)).toBe(true);
  });

  it("uses a stable UTC period key for tenant storage", () => {
    expect(periodStart(now)).toBe("2026-10-11");
  });
});
