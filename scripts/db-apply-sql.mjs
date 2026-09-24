/**
 * Apply a .sql file as the database owner.
 *
 * Usage: node scripts/db-apply-sql.mjs drizzle/0003_rbac_seed.sql
 *
 * Why this exists: on this project `drizzle-kit migrate` (0.31.10) did not pick
 * up a newly added custom migration on an already-migrated database, and it
 * reported neither success nor failure. Migrations are still the source of
 * truth for fresh branches; this runner applies one idempotent file explicitly
 * and reports the outcome so nothing is silently skipped.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/db-apply-sql.mjs <path-to.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set.");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const host = new URL(url).host;

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log(`applying ${file} to ${host}`);
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("applied successfully");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    /* the failed statement may have aborted the transaction already */
  }
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
