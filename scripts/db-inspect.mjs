/**
 * Read-only database inspector.
 *
 * Usage: node scripts/db-inspect.mjs [--json]
 *
 * Reports the live shape of whichever branch DATABASE_URL_UNPOOLED points at:
 * tables, row estimates, columns, RLS flags, policies, roles and extensions.
 * It issues SELECT-only queries and never mutates schema or data.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set.");
  process.exit(1);
}

const asJson = process.argv.includes("--json");
const client = new pg.Client({ connectionString: url });

const TABLES_SQL = `
  select c.relname                                as table_name,
         c.relrowsecurity                          as rls_enabled,
         c.relforcerowsecurity                     as rls_forced,
         coalesce(s.n_live_tup, 0)                 as estimated_rows,
         pg_catalog.obj_description(c.oid, 'pg_class') as comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
`;

const COLUMNS_SQL = `
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position;
`;

const POLICIES_SQL = `
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
  order by tablename, policyname;
`;

const ROLES_SQL = `
  select rolname, rolsuper, rolcreatedb, rolcanlogin, rolbypassrls, rolconnlimit
  from pg_roles
  where rolname not like 'pg\\_%'
  order by rolname;
`;

const EXTENSIONS_SQL = `select extname, extversion from pg_extension order by extname;`;

const CONSTRAINTS_SQL = `
  select conrelid::regclass::text as table_name, conname, contype
  from pg_constraint
  where connamespace = 'public'::regnamespace
  order by table_name, conname;
`;

async function main() {
  await client.connect();
  const host = new URL(url).host;
  const db = new URL(url).pathname.replace("/", "");

  // Sequential on purpose: a single pg client must not overlap queries.
  const tables = await client.query(TABLES_SQL);
  const columns = await client.query(COLUMNS_SQL);
  const policies = await client.query(POLICIES_SQL);
  const roles = await client.query(ROLES_SQL);
  const extensions = await client.query(EXTENSIONS_SQL);
  const constraints = await client.query(CONSTRAINTS_SQL);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          endpoint: host,
          database: db,
          tables: tables.rows,
          columns: columns.rows,
          policies: policies.rows,
          roles: roles.rows,
          extensions: extensions.rows,
          constraints: constraints.rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`endpoint      : ${host}`);
  console.log(`database      : ${db}`);
  console.log(`public tables : ${tables.rowCount}`);
  console.log("");
  console.log("table_name".padEnd(34), "rls", "force", "rows");
  for (const t of tables.rows) {
    console.log(
      String(t.table_name).padEnd(34),
      String(t.rls_enabled).padEnd(5),
      String(t.rls_forced).padEnd(5),
      t.estimated_rows,
    );
  }
  console.log("");
  console.log(`columns: ${columns.rowCount} · policies: ${policies.rowCount} · constraints: ${constraints.rowCount}`);
  console.log(`roles: ${roles.rows.map((r) => r.rolname).join(", ")}`);
  console.log(`extensions: ${extensions.rows.map((e) => `${e.extname}@${e.extversion}`).join(", ")}`);
}

main()
  .catch((err) => {
    console.error("Inspection failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
