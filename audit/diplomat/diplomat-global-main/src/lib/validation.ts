/**
 * Shared server-side validation utilities.
 *
 * These schemas and helpers are used across all public and admin forms.
 * Client-side validation is UX only; these must be applied server-side.
 */
import { z } from "zod";

// ─── Human Name Validation ───
// Accepts Unicode letters, spaces, apostrophes, hyphens, periods.
// Rejects pure numeric, pure punctuation, or empty strings.
// Supports international names (e.g. José, O'Brien, Muhammad-Ali, Dr. Smith).
export const humanNameSchema = z.preprocess(
  (val: unknown) => (typeof val === "string" ? val.trim().normalize("NFC") : val),
  z
    .string()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer")
    .refine((val: string) => /\p{L}/u.test(val), "Name must contain at least one letter")
    .refine(
      (val: string) => /^[\p{L}\p{M}\s\u0027\u2019\u02BC.\-\u2010\u2013]+$/u.test(val),
      "Name can only contain letters, spaces, apostrophes, hyphens, or periods",
    )
    .refine((val: string) => !/\d/.test(val), "Name cannot contain numbers")
    .refine((val: string) => !/[<>]/.test(val), "Name cannot contain angle brackets")
    .refine((val: string) => {
      const letters = (val.match(/\p{L}/gu) || []).length;
      return letters / val.length >= 0.3;
    }, "Name must be primarily letters"),
);

// ─── Email Validation ───
// Normalizes: trim, lowercase, max 254 chars, valid syntax.
// Does NOT claim the email exists.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must be 254 characters or fewer")
  .email("Please enter a valid email address");

// ─── Phone Validation ───
// Accepts common phone formats: +234..., 0803..., etc.
// Optional field in most contexts.
export const phoneSchema = z
  .string()
  .trim()
  .max(30, "Phone must be 30 characters or fewer")
  .refine(
    (val: string) => {
      if (val === "") return true;
      try {
        const { parsePhoneNumberFromString } = require("libphonenumber-js");
        const parsed = parsePhoneNumberFromString(val);
        return parsed ? parsed.isValid() : false;
      } catch {
        return false;
      }
    },
    "Please enter a valid international phone number",
  )
  .optional()
  .or(z.literal(""));

// ─── Free Text Validation ───
// For general text fields: description, message, bio, etc.
// Sanitizes control characters while preserving legitimate punctuation.
export const freeTextSchema = (min: number = 1, max: number = 5000) =>
  z
    .string()
    .trim()
    .min(min, `Must be at least ${min} character${min === 1 ? "" : "s"}`)
    .max(max, `Must be ${max} characters or fewer`)
    .refine(
      // eslint-disable-next-line no-control-regex -- intentional: reject control characters in user input
      (val) => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(val),
      "Text contains invalid control characters",
    );

// ─── Product Specification Validation ───
// Preserves technical symbols: 27", 3840 × 2160, 2× HDMI, USB-C, Wi-Fi 6E
export const specKeySchema = z
  .string()
  .trim()
  .min(1, "Property name is required")
  .max(80, "Property name must be 80 characters or fewer");

export const specValueSchema = z
  .string()
  .trim()
  .min(1, "Value is required")
  .max(200, "Value must be 200 characters or fewer");

// ─── Slug Validation ───
export const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(200, "Slug must be 200 characters or fewer")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase letters, numbers, and hyphens",
  );

// ─── URL Validation ───
export const urlSchema = z
  .string()
  .trim()
  .url("Please enter a valid URL")
  .max(2000, "URL must be 2000 characters or fewer");

// ─── Price Validation ───
export const priceSchema = z
  .number()
  .min(0, "Price cannot be negative")
  .max(100_000_000, "Price is too high");

// ─── Quantity / Integer Validation ───
export const positiveIntSchema = z.number().int().min(0, "Must be zero or greater");

// ─── Sanitization Helpers ───

/**
 * Strip control characters while preserving normal text.
 */
export function sanitizeText(input: string): string {
  return (
    input
      // eslint-disable-next-line no-control-regex -- intentional: strip control characters from user input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // Remove control chars
      .replace(/\r\n/g, "\n") // Normalize line endings
      .trim()
  );
}

/**
 * Normalize email: trim, lowercase, collapse whitespace.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Escape CSV cell content to prevent formula injection.
 * Fields starting with =, +, -, @, \t, \r are prefixed with a single quote.
 * Per OWASP CSV injection guidance.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a URL-friendly slug from a title.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Zod Schemas for Common Admin Forms ───

/** Staff invite form */
export const staffInviteSchema = z.object({
  email: emailSchema,
  role_id: z.string().uuid("Please select a valid role"),
});

/** Newsletter subscriber (public) */
export const newsletterSubscribeSchema = z.object({
  email: emailSchema,
});

/** Contact form (public) — includes honeypot field for bot trapping */
export const contactFormSchema = z.object({
  name: humanNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  subject: freeTextSchema(1, 200),
  message: freeTextSchema(10, 5000),
  // Honeypot: must be empty. Bots fill hidden fields; humans leave them blank.
  website: z.string().max(0).default(""),
});

/** Product review (public) */
export const reviewFormSchema = z.object({
  customer_name: humanNameSchema,
  customer_email: emailSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(200).optional(),
  body: freeTextSchema(10, 5000),
});

/** Product request (public) */
export const productRequestSchema = z.object({
  name: humanNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  product_name: freeTextSchema(1, 200),
  details: freeTextSchema(0, 5000).optional(),
});

/** Product admin create/update */
export const productAdminSchema = z.object({
  name: freeTextSchema(1, 200),
  tagline: freeTextSchema(0, 300).optional(),
  slug: slugSchema.optional(),
  price: priceSchema,
  compare_at_price: priceSchema.optional(),
  category_id: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  description: freeTextSchema(0, 10000).optional(),
  featured: z.boolean().optional(),
  is_new: z.boolean().optional(),
  in_stock: z.boolean().optional(),
});

/** Product specification */
export const specSchema = z.object({
  label: specKeySchema,
  value: specValueSchema,
});

/** Blog post admin */
export const blogPostAdminSchema = z.object({
  title: freeTextSchema(1, 300),
  slug: slugSchema.optional(),
  excerpt: freeTextSchema(0, 500).optional(),
  content: freeTextSchema(0, 50000).optional(),
  category: freeTextSchema(0, 100).optional(),
  type: z.enum(["text", "video"]).optional(),
  youtube_url: urlSchema.optional().or(z.literal("")),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/** Testimonial admin */
export const testimonialAdminSchema = z.object({
  name: humanNameSchema,
  role: freeTextSchema(0, 100).optional(),
  message: freeTextSchema(1, 2000),
  rating: z.number().int().min(1).max(5).default(5),
});

/** Category admin */
export const categoryAdminSchema = z.object({
  name: freeTextSchema(1, 100),
  slug: slugSchema.optional(),
  icon: z.string().max(50).optional(),
});

/** Site page admin */
export const sitePageAdminSchema = z.object({
  slug: slugSchema,
  title: freeTextSchema(1, 200),
  content: freeTextSchema(0, 100000).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/** Coupon admin */
export const couponAdminSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9]+$/i, "Code must be alphanumeric"),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().min(0.01),
  min_order_amount: z.number().min(0).optional(),
  max_uses: positiveIntSchema.optional(),
  valid_from: z.string(),
  valid_until: z.string(),
});

/** Profile update */
export const profileUpdateSchema = z.object({
  display_name: humanNameSchema.optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

/**
 * Full contact-name pair schema (first + last).
 * Use for checkout, staff invite, customer edit, import.
 */
export const personFullNameSchema = z.object({
  first_name: humanNameSchema,
  last_name: humanNameSchema,
});

/** Site settings update */
export const siteSettingsSchema = z.object({
  company_name: freeTextSchema(0, 200).optional(),
  tagline: freeTextSchema(0, 300).optional(),
  bn_number: freeTextSchema(0, 100).optional(),
  support_email: emailSchema.optional().or(z.literal("")),
  phone: phoneSchema,
  whatsapp_url: urlSchema.optional().or(z.literal("")),
  location: freeTextSchema(0, 300).optional(),
});

// ─── Phone Lock Enforcement ───
// Server-side enforcement of the phone_lock_nigeria setting.
// When enabled, rejects non-Nigerian phone numbers in public forms.



/**
 * Check if phone numbers are locked to Nigeria via site settings.
 * Returns the setting value from the database.
 */
export async function isPhoneLockEnabled(): Promise<boolean> {
  try {
    const { createDatabaseClient } = await import("./admin/admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db
      .from("site_settings")
      .select("value")
      .eq("key", "phone_lock_nigeria")
      .single();
    return data?.value === "true";
  } catch {
    return false;
  }
}

/**
 * Check if a phone number is a valid Nigerian E.164 number.
 * Self-contained — no imports from UI components.
 */
function isNigerianPhoneLocal(value: string): boolean {
  if (!value || value.trim() === "") return true;
  try {
    const { parsePhoneNumberFromString } = require("libphonenumber-js");
    const parsed = parsePhoneNumberFromString(value, "NG" as any);
    if (!parsed) return false;
    return parsed.isValid() && parsed.country === "NG";
  } catch {
    return false;
  }
}

/**
 * Validate phone with lock enforcement.
 * If lock is enabled, rejects non-Nigerian numbers.
 * Returns null if valid, error message if invalid.
 */
export async function validatePhoneWithLock(phone: string): Promise<string | null> {
  if (!phone || phone.trim() === "") return null; // optional
  const lockEnabled = await isPhoneLockEnabled();
  if (lockEnabled && !isNigerianPhoneLocal(phone)) {
    return "Phone number must be a Nigerian number";
  }
  return null;
}
