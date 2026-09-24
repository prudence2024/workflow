/**
 * Export utilities for generating per-table CSV and JSON exports.
 * Used by the admin backup/export feature.
 */

/**
 * Convert an array of objects to CSV string with proper escaping.
 */
export function arrayToCSV(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0) return "";
  const cols = headers || Object.keys(rows[0]);
  const lines: string[] = [];
  // Header
  lines.push(cols.map((h) => csvEscape(h)).join(","));
  // Rows
  for (const row of rows) {
    lines.push(
      cols
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return csvEscape(str);
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * CSV-escape a value: wrap in quotes if it contains comma, quote, or newline.
 */
function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/**
 * Redact sensitive columns from a row.
 */
export function redactRow(row: Record<string, any>, sensitiveCols: string[]): Record<string, any> {
  const clean = { ...row };
  for (const col of sensitiveCols) {
    if (clean[col] !== undefined) clean[col] = "[REDACTED]";
  }
  return clean;
}

/**
 * Generate a manifest object for the export.
 */
export function buildManifest(
  tableResults: Record<string, { rowCount: number; error?: string }>,
): Record<string, any> {
  let totalRows = 0;
  const tables: Record<string, any> = {};
  for (const [table, info] of Object.entries(tableResults)) {
    tables[table] = {
      row_count: info.rowCount,
      ...(info.error ? { error: info.error } : {}),
    };
    totalRows += info.rowCount;
  }
  return {
    exported_at: new Date().toISOString(),
    application: "diplomat-global",
    schema_version: "latest",
    total_rows: totalRows,
    table_count: Object.keys(tableResults).length,
    tables,
    sensitive_columns_redacted: ["site_settings.value"],
    excluded_from_export: [
      "clerk sessions (managed by Clerk)",
      "Supabase auth (managed by Supabase)",
      "Vercel environment variables",
      "API secrets and service-role keys",
    ],
    migration_note:
      "For full PostgreSQL migration, use pg_dump/pg_restore from Supabase Dashboard.",
  };
}
