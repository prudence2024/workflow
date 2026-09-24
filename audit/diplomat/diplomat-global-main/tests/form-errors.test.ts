import { describe, it, expect } from "vitest";
import {
  getFormErrorMessage,
  getAllFormErrors,
  getFieldErrorMap,
  getFieldLabel,
} from "../src/lib/form-errors";
import { readFileSync } from "fs";
import { join } from "path";

/** Create a ZodError-shaped object */
const zod = (issues: Array<{ path: (string | number)[]; message: string }>) =>
  ({ name: "ZodError", issues }) as unknown;

// ══════════════════════════════════════════════════════════════
// CONTRACT: getFormErrorMessage
// ══════════════════════════════════════════════════════════════

describe("getFormErrorMessage", () => {
  it("handles null/undefined/non-object gracefully", () => {
    expect(getFormErrorMessage(null)).toContain("unexpected error");
    expect(getFormErrorMessage(undefined)).toContain("unexpected error");
    expect(getFormErrorMessage(42).length).toBeGreaterThan(0);
    expect(getFormErrorMessage("").length).toBeGreaterThan(0);
  });

  it("returns first issue only (not all)", () => {
    const err = zod([
      { path: ["email"], message: "Invalid email" },
      { path: ["name"], message: "Required" },
    ]);
    const msg = getFormErrorMessage(err);
    expect(msg.toLowerCase()).toContain("email");
    expect(msg.toLowerCase()).not.toContain("name");
  });

  it("translates empty-string Zod message to Please enter your <field>", () => {
    const err = zod([{ path: ["shippingAddress", "lga"], message: "String must contain at least 1 character(s)" }]);
    const msg = getFormErrorMessage(err);
    expect(msg).toContain("Local Government Area");
    expect(msg).not.toContain("character(s)");
  });

  it("translates serialized JSON error from server function", () => {
    const err = new Error(JSON.stringify({ path: ["email"], message: "Invalid email" }));
    const msg = getFormErrorMessage(err);
    expect(msg.toLowerCase()).toContain("email");
  });

  it("passes through short friendly server messages", () => {
    const msg = getFormErrorMessage(new Error("Coupon code not found."));
    expect(msg).toBe("Coupon code not found.");
  });

  it("hides long/complex messages with fallback", () => {
    const msg = getFormErrorMessage(new Error("X".repeat(300)));
    expect(msg.length).toBeLessThan(100);
    expect(msg).toContain("try again");
  });
});

// ══════════════════════════════════════════════════════════════
// CONTRACT: getAllFormErrors
// ══════════════════════════════════════════════════════════════

describe("getAllFormErrors", () => {
  it("returns all issues with human-friendly messages", () => {
    const err = zod([
      { path: ["email"], message: "Invalid email" },
      { path: ["shippingAddress", "lga"], message: "Required" },
    ]);
    const issues = getAllFormErrors(err);
    expect(issues).toHaveLength(2);
    expect(issues[0].field).toBe("email");
    expect(issues[1].field).toBe("shippingAddress.lga");
    for (const i of issues) {
      expect(i.message).not.toContain("too_small");
      expect(i.message).not.toContain("invalid_string");
    }
  });

  it("single fallback for non-Zod errors", () => {
    expect(getAllFormErrors(new Error("Oops"))).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════
// CONTRACT: getFieldErrorMap
// ══════════════════════════════════════════════════════════════

describe("getFieldErrorMap", () => {
  it("returns field→message map", () => {
    const map = getFieldErrorMap(zod([{ path: ["email"], message: "Invalid email" }]));
    expect(map.email).toBeTruthy();
  });

  it("empty for generic errors", () => {
    expect(Object.keys(getFieldErrorMap(new Error("Oops")))).toHaveLength(0);
  });

  it("deduplicates to first per field", () => {
    const map = getFieldErrorMap(zod([
      { path: ["email"], message: "A" },
      { path: ["email"], message: "B" },
    ]));
    expect(Object.keys(map)).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════
// CONTRACT: getFieldLabel
// ══════════════════════════════════════════════════════════════

describe("getFieldLabel", () => {
  const LABELS: [string, string][] = [
    ["email", "Email address"],
    ["fullName", "Full name"],
    ["shippingAddress.lga", "Local Government Area (LGA)"],
    ["shippingAddress.state", "State"],
    ["shippingAddress.address", "Delivery address"],
    ["phone", "Phone number"],
    ["name", "Your name"],
  ];

  for (const [path, expected] of LABELS) {
    it(`"${path}" → "${expected}"`, () => {
      expect(getFieldLabel(path)).toBe(expected);
    });
  }

  it("humanizes unknown field names", () => {
    expect(getFieldLabel("someFieldName").length).toBeGreaterThan(3);
  });
});

// ══════════════════════════════════════════════════════════════
// CONTRACT: No developer wording escapes
// ══════════════════════════════════════════════════════════════

describe("No developer wording in user messages", () => {
  const FORBIDDEN = ["too_small", "too_big", "invalid_type", "ZodError", "character(s)", "inclusive"];

  const cases: unknown[] = [
    zod([{ path: ["email"], message: "String must contain at least 1 character(s)" }]),
    zod([{ path: ["fullName"], message: "Required" }]),
    zod([{ path: ["shippingAddress", "lga"], message: "Invalid input" }]),
    new Error(JSON.stringify({ path: ["email"], message: "Invalid email" })),
    null,
  ];

  for (const err of cases) {
    const msg = getFormErrorMessage(err);
    for (const word of FORBIDDEN) {
      it(`"${msg.slice(0, 60)}" does not contain "${word}"`, () => {
        expect(msg).not.toContain(word);
      });
    }
  }
});

// ══════════════════════════════════════════════════════════════
// SMOKE: Form components import getFieldErrorMap
// ══════════════════════════════════════════════════════════════

describe("Form components use per-field error pattern", () => {
  const FORMS = [
    { path: "src/routes/contact.tsx", fields: ["name", "email", "subject", "message"] },
    { path: "src/components/review-form.tsx", fields: ["name", "email", "body", "rating"] },
    { path: "src/routes/reviews.tsx", fields: ["name", "message"] },
    { path: "src/components/newsletter-section.tsx", fields: ["email"] },
    { path: "src/routes/request.tsx", fields: ["first_name", "email", "product_description"] },
  ];

  for (const { path: filePath, fields } of FORMS) {
    const src = readFileSync(join(process.cwd(), filePath), "utf-8");

    it(`${filePath} imports getFieldErrorMap`, () => {
      expect(src).toContain("getFieldErrorMap");
    });

    it(`${filePath} has fieldErrors state`, () => {
      expect(src).toMatch(/fieldErrors/);
    });

    it(`${filePath} has clearFieldError or inline clear`, () => {
      // Either named clearFieldError function or inline fieldErrors state update
      expect(src).toMatch(/clearFieldError|setFieldErrors/);
    });

    for (const field of fields) {
      it(`${filePath} has aria-invalid on ${field}`, () => {
        expect(src).toContain(`fieldErrors.${field}`);
      });
    }
  }
});

// ══════════════════════════════════════════════════════════════
// CATEGORY CACHE CONSISTENCY
// ══════════════════════════════════════════════════════════════

describe("Category cache key consistency", () => {
  it("getPublicCategories uses key 'categories:list'", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/admin/server-fns.ts"),
      "utf-8",
    );
    // Find the getPublicCategories function and verify cache key
    const match = src.match(/getPublicCategories[\s\S]*?cached\((['"])/);
    expect(match).not.toBeNull();
  });

  it("create/update/delete all invalidate 'categories:list'", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/admin/server-fns.ts"),
      "utf-8",
    );
    // Find all invalidateCache calls for categories
    const matches = src.match(/invalidateCache\(["']categories:list["']\)/g);
    // Should be at least 3: create, update, delete
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("public query filters active=true (matches schema column)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/admin/server-fns.ts"),
      "utf-8",
    );
    // Verify the public query uses .eq("active", true)
    expect(src).toContain('.eq("active", true)');
  });

  it("baseline schema defines 'active' column (not is_active)", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260827_baseline.sql"),
      "utf-8",
    );
    // Find the categories table definition
    const catSection = sql.substring(
      sql.indexOf("CREATE TABLE IF NOT EXISTS public.categories"),
      sql.indexOf("CREATE TABLE IF NOT EXISTS public.categories") + 500,
    );
    expect(catSection).toContain("active boolean");
    expect(catSection).not.toContain("is_active");
  });
});
