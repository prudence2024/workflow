export type WorkerContact = {
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
  custom_fields?: Record<string, unknown>;
};
export function contactValue(contact: WorkerContact | null | undefined, column: string | undefined): string;
export function mappingForField(field: { name: string; providerFieldId?: string | null; label?: string }, mapping: Record<string, string>): string | undefined;
export function buildSubmissionValues(fields: Array<{ name: string; label: string; required?: boolean; pageIndex?: number }>, mapping: Record<string, string>, contact: WorkerContact | null | undefined): { values: Record<string, string>; missing: string[] };
export function buildMappingPreview(fields: Array<{ name: string; label: string; required?: boolean }>, mapping: Record<string, string>, contact: WorkerContact | null | undefined): Array<{ label: string; required: boolean; mappedKey: string; value: string }>;
