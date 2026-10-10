export type PrequeueContact = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  customFields: Record<string, string> | null;
};

export type RequiredFormField = { name: string; label?: string; required?: boolean };

/**
 * Validates one contact against the target form before a browser job is
 * created. This is deliberately pure so the same rule is testable without a
 * browser or database connection.
 */
export function validatePrequeueContact(
  contact: PrequeueContact,
  fields: RequiredFormField[],
  mapping: Record<string, string>,
): { valid: boolean; missing: string[] } {
  const missing = fields
    .filter((field) => field.required)
    .filter((field) => {
      const source = mapping[field.name];
      if (!source) return true;
      if (source.startsWith("custom__")) return !contact.customFields?.[source.slice("custom__".length)]?.trim();
      const value = contact[source as keyof PrequeueContact];
      return typeof value !== "string" || value.trim().length === 0;
    })
    .map((field) => field.label || field.name);

  return { valid: missing.length === 0, missing };
}
