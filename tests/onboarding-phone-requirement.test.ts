import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeNigerianPhone } from "@/lib/phoneNumber";

describe("required onboarding phone without OTP", () => {
  it("normalizes accepted Nigerian formats and rejects malformed values", () => {
    expect(normalizeNigerianPhone("08012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("2348012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("+2348012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("01012345678")).toBeNull();
    expect(normalizeNigerianPhone("+2338012345678")).toBeNull();
  });

  it("finalizes from details without an OTP or provider call", () => {
    const actions = readFileSync("src/app/onboarding/actions.ts", "utf8");
    const page = readFileSync("src/app/onboarding/page.tsx", "utf8");
    expect(actions).toContain('phone: z.string().trim().min(7, "Phone number is required")');
    expect(actions).toContain('stage: "details"');
    expect(actions).toContain("await finishWorkspace(user)");
    expect(actions).not.toContain("createPhoneNumber");
    expect(actions).not.toContain("prepareVerification");
    expect(actions).not.toContain("TERMII_API_KEY");
    expect(page).not.toContain("PhoneVerification");
    expect(page).not.toContain('step === "phone"');
  });
});
