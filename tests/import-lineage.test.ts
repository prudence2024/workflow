import pg from "pg";
import { describe, expect, it } from "vitest";
import { hasDatabase } from "./setup";

const suite = hasDatabase ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

suite("import lineage and audience snapshot schema", () => {
  it("has tenant-scoped lineage and run snapshot tables", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      const tables = await client.query<{ name: string | null }>(`
        select to_regclass(name)::text as name
          from unnest(array['public.contact_imports', 'public.campaign_audience_snapshots']) as name
      `);
      expect(tables.rows.map((row) => row.name)).toEqual([
        "contact_imports",
        "campaign_audience_snapshots",
      ]);

      const rls = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        select relrowsecurity, relforcerowsecurity
          from pg_class
         where oid in ('public.contact_imports'::regclass, 'public.campaign_audience_snapshots'::regclass)
         order by oid::text
      `);
      expect(rls.rows).toHaveLength(2);
      expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    } finally {
      await client.end();
    }
  });
});
