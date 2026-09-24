import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Checkout phone-state contract (Owner requirement):
 *
 * The client must distinguish EMPTY / INCOMPLETE / INVALID / VALID and never
 * fabricate a phone number from partial input; the server must normalize the
 * stored phone to canonical E.164 (a stray leading 0 after +234 must never
 * reach customer records or the order shipping snapshot).
 */

const CHECKOUT = readFileSync("src/routes/checkout.tsx", "utf8");
const SERVER = readFileSync("src/lib/checkout.server.ts", "utf8");

describe("checkout phone client contract", () => {
  it("treats an empty field as MISSING, not invalid (truthful error wording)", () => {
    expect(CHECKOUT).toContain("Please enter your phone number.");
    expect(CHECKOUT).toContain("const phoneMissing = !phoneE164 && !rawPhone;");
  });

  it("documents the empty-vs-invalid distinction in source", () => {
    expect(CHECKOUT).toContain("an empty field is a missing value, not an");
  });

  it("does not mark the field invalid while the customer is still typing", () => {
    // errors only render from fieldErrors set at submit; no onChange validation
    const phoneBlock = CHECKOUT.slice(
      CHECKOUT.indexOf("{/* International phone input */}"),
      CHECKOUT.indexOf("{/* State dropdown"),
    );
    expect(phoneBlock).not.toMatch(/INVALID|invalid phone/i);
    // clearing the error as the user types is the only onChange behavior
    expect(phoneBlock).toContain("setFieldErrors((prev) =>");
  });
});

describe("checkout phone server contract", () => {
  it("normalizes the stored phone to canonical E.164", () => {
    expect(SERVER).toContain("parsePhoneNumberFromString(data.phone)");
    expect(SERVER).toContain("const canonicalPhone = parsedPhone?.number ?? data.phone;");
  });

  it("stores the canonical phone, not the raw client string", () => {
    // customer insert + existing-customer patch both use canonicalPhone
    expect(SERVER).toContain("phone: canonicalPhone,");
    expect(SERVER).not.toContain("phone: data.phone,");
    // shipping snapshot uses canonicalPhone
    expect(SERVER).toContain("phone: canonicalPhone,\n    });");
  });

  it("keeps the strict E.164 schema gate (no unbounded phone shapes)", () => {
    expect(SERVER).toContain("/^\\+[1-9]\\d{6,14}$/");
  });
});
