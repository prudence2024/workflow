import "@tanstack/react-start/server-only";
import type { createDatabaseClient } from "./database.server";
type DatabaseClient = ReturnType<typeof createDatabaseClient>;

export async function loadBusinessSettings(db: DatabaseClient): Promise<Record<string, string>> {
  const result = await db
    .from("site_settings")
    .select("key, value")
    .in("key", [
      "company_name",
      "tagline",
      "bn_number",
      "support_email",
      "phone",
      "location",
      "website_url",
    ]);
  if (result.error) throw new Error("Receipt business details are temporarily unavailable");
  return Object.fromEntries(
    (result.data ?? []).map((row: { key: string; value: string | null }) => [
      row.key,
      row.value ?? "",
    ]),
  );
}
