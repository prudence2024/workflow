/**
 * Convert Zod or server validation errors into user-friendly messages.
 * Shows which field needs attention in plain human language.
 * Never exposes Zod internals, serialized JSON, or developer wording to users.
 */

/* ── Field label mappings ────────────────────────────────────────── */

const FIELD_LABELS: Record<string, string> = {
  email: "Email address",
  fullName: "Full name",
  name: "Your name",
  customer_name: "Your name",
  customer_email: "Email address",
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone number",
  subject: "Subject",
  message: "Message",
  rating: "Rating",
  title: "Title",
  body: "Your review",
  consent: "Consent checkbox",
  consent_to_publish: "Consent checkbox",
  couponCode: "Coupon code",
  code: "Code",
  category: "Category",
  description: "Description",
  price: "Price",
  quantity: "Quantity",
  product_id: "Product",
  product_description: "Product description",
  budget: "Budget range",
  preferred_brand: "Preferred brand",
  urgency: "Urgency",
  website: "Website",
  "shippingAddress.state": "State",
  "shippingAddress.lga": "Local Government Area (LGA)",
  "shippingAddress.city": "City / Area",
  "shippingAddress.address": "Delivery address",
};

function humanizeField(path: string): string {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  return path
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\./g, " → ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Human-friendly message rewriting ────────────────────────────── */

/**
 * Translate raw Zod/validation wording into plain language.
 * Input is the original Zod `.message` string; output is user-facing text.
 */
function humanizeMessage(raw: string, fieldLabel: string | null): string {
  if (!raw) return fieldLabel ? `Please enter your ${fieldLabel}.` : "Please check this field.";

  const lower = raw.toLowerCase();

  // ── Empty / required ──
  if (lower === "required" || lower.includes("received undefined") || lower.includes("received null")) {
    return fieldLabel ? `Please enter your ${fieldLabel}.` : "This field is required.";
  }

  // ── Too small / minimum length ──
  // Catches: "String must contain at least 1 character(s)"
  //          "too_small" code
  //          "Must be at least N characters"
  if (lower.includes("too_small") || lower.includes("must contain at least") || lower.includes("at least")) {
    const match = raw.match(/(?:at least|minimum)\s*[:=]?\s*(\d+)/i);
    const min = match ? parseInt(match[1], 10) : null;
    if (min && min > 1) {
      return fieldLabel
        ? `${fieldLabel} must be at least ${min} characters.`
        : `Must be at least ${min} characters.`;
    }
    // Minimum is 1 or unspecified — field is empty
    return fieldLabel ? `Please enter your ${fieldLabel}.` : "This field cannot be empty.";
  }

  // ── Too large / maximum length ──
  // Catches: "too_big" / "too_long" codes
  //          "Must be at most N characters"
  //          "Must be no longer than N characters"
  if (lower.includes("too_long") || lower.includes("too_big") || lower.includes("at most") || lower.includes("maximum")) {
    const match = raw.match(/(?:at most|maximum|no longer than)\s*[:=]?\s*(\d+)/i);
    const max = match ? match[1] : null;
    if (max) {
      return fieldLabel
        ? `${fieldLabel} must be no longer than ${max} characters.`
        : `Must be no longer than ${max} characters.`;
    }
    return fieldLabel ? `${fieldLabel} is too long.` : "This field is too long.";
  }

  // ── Email ──
  if (lower.includes("invalid email") || lower.includes("not a valid email") || lower.includes("must contain @")) {
    return "Please enter a valid email address.";
  }
  if (lower.includes("invalid_string") && lower.includes("email")) {
    return "Please enter a valid email address.";
  }

  // ── Expected string ──
  if (lower.includes("expected string") || lower.includes("expected number")) {
    return fieldLabel ? `Please enter a valid ${fieldLabel}.` : "Please enter a valid value.";
  }

  // ── Enum / invalid option ──
  if (lower.includes("invalid_enum_value") || lower.includes("expected enum")) {
    return fieldLabel ? `Please select a valid ${fieldLabel}.` : "Please select a valid option.";
  }

  // ── Generic invalid_type ──
  if (lower.includes("invalid_type")) {
    return fieldLabel ? `Please enter a valid ${fieldLabel}.` : "Please check this field.";
  }

  // ── If the message is already human-friendly (short, no Zod keywords), keep it ──
  const zodKeywords = [
    "too_small", "too_big", "too_long", "invalid_type", "invalid_string",
    "invalid_enum", "received", "expected", "minimum", "maximum", "inclusive",
  ];
  const hasZodKeyword = zodKeywords.some((kw) => lower.includes(kw));
  if (!hasZodKeyword && raw.length < 120 && !raw.includes("{") && !raw.includes('"')) {
    return raw; // Already friendly (e.g. "Coupon code not found.")
  }

  // ── Ultimate fallback ──
  return fieldLabel ? `Please check your ${fieldLabel}.` : "Please check your input and try again.";
}

/* ── Issue extraction ────────────────────────────────────────────── */

interface FormIssue {
  field: string;
  fieldLabel: string;
  message: string;
}

function extractIssues(err: unknown): FormIssue[] {
  if (!err) return [{ field: "", fieldLabel: "", message: "An unexpected error occurred. Please try again." }];

  // ZodError — has a `.issues` array
  if (typeof err === "object" && err !== null && "issues" in err) {
    const issues = (err as { issues: unknown[] }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues.map((issue: any) => {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        const fieldLabel = path ? humanizeField(path) : null;
        return {
          field: path,
          fieldLabel: fieldLabel || "",
          message: humanizeMessage(issue.message || "", fieldLabel),
        };
      });
    }
  }

  // Plain Error — may contain serialized Zod JSON from server functions
  const msg = (err as Error)?.message || "";
  if (msg.includes('"path"') && msg.includes('"message"')) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.path && parsed.message) {
        const path = Array.isArray(parsed.path) ? parsed.path.join(".") : "";
        const fieldLabel = path ? humanizeField(path) : null;
        return [{ field: path, fieldLabel: fieldLabel || "", message: humanizeMessage(parsed.message, fieldLabel) }];
      }
      // Array of issues
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => {
          const path = Array.isArray(p.path) ? p.path.join(".") : "";
          const fieldLabel = path ? humanizeField(path) : null;
          return { field: path, fieldLabel: fieldLabel || "", message: humanizeMessage(p.message || "", fieldLabel) };
        });
      }
    } catch {
      // Not JSON — fall through
    }
  }

  // Short server-side message (already friendly)
  if (msg.length < 200 && !msg.includes("{")) {
    return [{ field: "", fieldLabel: "", message: msg }];
  }

  // Fallback
  return [{ field: "", fieldLabel: "", message: "Something went wrong. Please try again." }];
}

/* ── Public API ──────────────────────────────────────────────────── */

/**
 * Get a single user-friendly error message for the first issue.
 * Use for toast notifications.
 */
export function getFormErrorMessage(err: unknown): string {
  const issues = extractIssues(err);
  return issues[0]?.message || "Something went wrong. Please try again.";
}

/**
 * Get ALL validation issues as { field, fieldLabel, message } objects.
 * Use for inline field-level error display.
 */
export function getAllFormErrors(err: unknown): FormIssue[] {
  return extractIssues(err);
}

/**
 * Get a user-friendly label for a field path.
 */
export function getFieldLabel(path: string): string {
  return humanizeField(path);
}

/**
 * Extract a map of field path → error message for quick lookup.
 * Returns empty object if no field-specific errors.
 *
 * @example
 * const fieldErrors = getFieldErrorMap(err);
 * if (fieldErrors["shippingAddress.lga"]) {
 *   // show inline error next to LGA field
 * }
 */
export function getFieldErrorMap(err: unknown): Record<string, string> {
  const issues = extractIssues(err);
  const map: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.field && !map[issue.field]) {
      map[issue.field] = issue.message;
    }
  }
  return map;
}
