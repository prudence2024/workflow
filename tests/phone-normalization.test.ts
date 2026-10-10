import { describe, expect, it } from "vitest";
import { normalizeInternationalPhone, normalizeNigerianPhone } from "@/lib/phoneNumber";

describe("Nigerian phone normalization", () => {
  it("normalizes supported local and international forms", () => {
    expect(normalizeNigerianPhone("08012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("+2348012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("2348012345678")).toBe("+2348012345678");
    expect(normalizeNigerianPhone("080 1234 5678")).toBe("+2348012345678");
  });

  it("rejects malformed or unsupported numbers", () => {
    expect(normalizeNigerianPhone("0801234567")).toBeNull();
    expect(normalizeNigerianPhone("+2338012345678")).toBeNull();
    expect(normalizeNigerianPhone("01012345678")).toBeNull();
    expect(normalizeNigerianPhone("not a phone")).toBeNull();
  });
});

describe("international onboarding phone input", () => {
  it("normalizes local input using the selected country dial code", () => {
    expect(normalizeInternationalPhone("08012345678", "+234")).toBe("+2348012345678");
    expect(normalizeInternationalPhone("4155552671", "+1")).toBe("+14155552671");
    expect(normalizeInternationalPhone("020 7946 0958", "+44")).toBe("+442079460958");
  });

  it("rejects malformed values and never invents a country", () => {
    expect(normalizeInternationalPhone("not a phone", "+234")).toBeNull();
    expect(normalizeInternationalPhone("08012345678")).toBeNull();
    expect(normalizeInternationalPhone("+23480123456789999", "+234")).toBeNull();
  });
});
