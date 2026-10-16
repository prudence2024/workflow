/** Pure mapping/payload helpers shared by the submission worker and tests. */
export function contactValue(contact, column) {
  if (!column) return "";
  if (column.startsWith("custom__")) return String(contact?.custom_fields?.[column.slice("custom__".length)] ?? "");
  const map = { firstName: "first_name", lastName: "last_name", email: "email", phone: "phone", company: "company", address: "address" };
  const direct = map[column] ?? column;
  if (contact && direct in contact) return String(contact[direct] ?? "");
  if (column === "name" || column === "fullName") return `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim();
  return String(contact?.[column] ?? "");
}

export function mappingForField(field, mapping) {
  return mapping[field.name] ?? mapping[field.providerFieldId] ?? mapping[field.label] ?? mapping[field.label?.toLowerCase()];
}

export function buildSubmissionValues(fields, mapping, contact) {
  const values = {};
  const missing = [];
  for (const field of fields) {
    const column = mappingForField(field, mapping);
    const value = column ? contactValue(contact, column).trim() : "";
    if (field.required && !value && (field.pageIndex ?? 0) === 0) missing.push(field.label);
    if (value) values[field.name] = value;
  }
  return { values, missing };
}

export function buildMappingPreview(fields, mapping, contact) {
  return fields.map((field) => {
    const column = mappingForField(field, mapping);
    return { label: field.label, required: Boolean(field.required), mappedKey: column ?? "", value: column ? contactValue(contact, column).trim() : "" };
  });
}
