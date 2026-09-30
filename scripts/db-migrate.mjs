/**
 * Deterministic migration runner.
 *
 * Usage: node scripts/db-migrate.mjs [--dry-run]
 *
 * Why this exists: `drizzle-kit migrate` (0.31.10) silently applied NOTHING on a
 * completely fresh branch and also skipped migrations added after the first run
 * — no error, no summary. Reproducing an empty production schema is not an
 * acceptable failure mode, so migrations are applied here in journal order with
 * an explicit record of what was applied.
 *
 * Behaviour:
 *   - reads drizzle/meta/_journal.json and applies entries in order;
 *   - records each applied file in drizzle.__drizzle_migrations (same shape
 *     drizzle itself uses), so tooling stays consistent;
 *   - already-recorded migrations are skipped;
 *   - each migration runs in its own transaction; a failure stops the run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set.");
  process.exit(1);
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const host = new URL(url).host;
console.log(`target: ${host}`);
if (dryRun) console.log("mode: dry run (no changes)");

const client = new pg.Client({ connectionString: url });

const BOOTSTRAP = `
  create schema if not exists drizzle;
  create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  );
`;

async function main() {
  await client.connect();
  await client.query(BOOTSTRAP);

  const applied = await client.query("select hash from drizzle.__drizzle_migrations");
  const appliedHashes = new Set(applied.rows.map((r) => r.hash));

  let count = 0;
  for (const entry of journal.entries) {
    const file = `drizzle/${entry.tag}.sql`;
    const sql = readFileSync(file, "utf8");

    if (appliedHashes.has(hash(sql))) {
      console.log(`skip    ${entry.tag} (already applied)`);
      continue;
    }

    if (dryRun) {
      console.log(`pending ${entry.tag}`);
      continue;
    }

    process.stdout.write(`apply   ${entry.tag} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
        [hash(sql), entry.when],
      );
      await client.query("commit");
      console.log("ok");
      count += 1;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      throw new Error(`${entry.tag}: ${err.message}`);
    }
  }

  const total = (await client.query("select count(*)::int n from drizzle.__drizzle_migrations"))
    .rows[0].n;
  const tables = await client.query(
    `select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`,
  );

  console.log("");
  console.log(`applied this run      : ${count}`);
  console.log(`recorded migrations   : ${total} of ${journal.entries.length}`);
  console.log(`public tables         : ${tables.rows[0].n}`);

  // A dry run lists pending entries without changing anything, so a lower
  // recorded count is the expected outcome, not a failure.
  if (!dryRun && total !== journal.entries.length) {
    throw new Error(
      `migration count mismatch: recorded ${total} but the journal lists ${journal.entries.length}`,
    );
  }
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

main()
  .catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
