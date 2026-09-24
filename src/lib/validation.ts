export function normalizeEmail(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePhone(value: string | undefined | null): string {
  if (!value) return "";
  const digits = value.replace(/[^\d+]/g, "");
  return digits;
}

export function isValidPhone(value: string): boolean {
  if (!value) return false;
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export type RowValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateContactRow(row: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}): RowValidationResult {
  const errors: string[] = [];
  if (!row.firstName || !row.firstName.trim()) {
    errors.push("Missing first name");
  }
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone);
  if (!email && !phone) {
    errors.push("Missing both email and phone");
  }
  if (email && !isValidEmail(email)) {
    errors.push("Invalid email format");
  }
  if (phone && !isValidPhone(phone)) {
    errors.push("Invalid phone format");
  }
  return { valid: errors.length === 0, errors };
}
