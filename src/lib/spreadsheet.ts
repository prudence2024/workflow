import * as XLSX from "xlsx";

export type ParsedSpreadsheet = {
  columns: string[];
  rows: Record<string, string>[];
};

export const STANDARD_IMPORT_COLUMNS = new Set([
  "firstname", "first_name", "lastname", "last_name", "email", "phone",
  "company", "organization", "organisation", "address",
]);

/** Stable, human-readable keys for columns that are not built-in contact fields. */
export function customFieldKey(label: string, index = 0): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `custom_field_${index + 1}`;
  return base.startsWith("custom_") ? base : `custom_${base}`;
}

export type ImportedCustomField = { key: string; label: string; column: string };

/** Stable custom-field descriptors for every non-contact spreadsheet column. */
export function importedCustomFields(columns: string[], reservedKeys = new Set<string>()): ImportedCustomField[] {
  const used = new Set(reservedKeys);
  return columns.flatMap((column, index) => {
    const normalized = column.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!normalized || STANDARD_IMPORT_COLUMNS.has(normalized)) return [];
    const base = customFieldKey(column, index);
    let key = base;
    let suffix = 2;
    while (used.has(key)) key = `${base}_${suffix++}`;
    used.add(key);
    return [{ key, label: column.trim() || `Custom field ${index + 1}`, column }];
  });
}

export function parseSpreadsheet(buffer: Buffer, fileName: string): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const columns = raw.length > 0 ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => {
    const normalized: Record<string, string> = {};
    for (const col of columns) {
      const value = row[col];
      normalized[col] = value === undefined || value === null ? "" : String(value).trim();
    }
    return normalized;
  });

  return { columns, rows };
}

export function buildWorkbook(sheetName: string, columns: string[], rows: Record<string, unknown>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const out = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}

export function buildCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  return XLSX.utils.sheet_to_csv(worksheet);
}
