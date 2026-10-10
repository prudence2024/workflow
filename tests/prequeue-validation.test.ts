import { describe, expect, it } from "vitest";
import { validatePrequeueContact } from "@/lib/prequeueValidation";

const contact = {
  firstName: "Amina",
  lastName: "Okafor",
  email: "amina@example.com",
  phone: "+2348012345678",
  company: null,
  address: null,
  customFields: { role: "Manager" },
};

describe("prequeue required-field validation", () => {
  it("accepts semantic mappings regardless of contact field order", () => {
    expect(validatePrequeueContact(contact, [
      { name: "email", label: "Email", required: true },
      { name: "first", label: "First name", required: true },
    ], { email: "email", first: "firstName" })).toEqual({ valid: true, missing: [] });
  });

  it("classifies missing and custom required fields before queueing", () => {
    expect(validatePrequeueContact({ ...contact, phone: null, customFields: {} }, [
      { name: "phone", label: "Phone", required: true },
      { name: "role", label: "Role", required: true },
    ], { phone: "phone", role: "custom__role" })).toEqual({ valid: false, missing: ["Phone", "Role"] });
  });
});
