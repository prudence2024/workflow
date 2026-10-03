/**
 * Repair campaign records falsely marked successful without real submissions.
 *
 * Background: `src/lib/submissionEngine.ts` used to simulate outcomes with
 * Math.random() and wrote status='successful' with the message
 * "Form submitted and confirmed by destination." without any external
 * submission. Demo seed fixtures (`scripts/seed-demo.mjs`) also wrote
 * 'successful' rows that were never submitted anywhere.
 *
 * This script moves every currently-'successful' record that carries NO
 * real-submission evidence to status='unverified' so the UI can no longer
 * present it as a confirmed external submission. Rows are never deleted.
 *
 * Usage: node scripts/repair-simulated-results.mjs [--dry-run|--apply]
 * Default is --dry-run (counts only, no changes).
 *
 * Safety:
 *   - refuses to run when NEON_BRANCH=production;
 *   - only touches rows with status='successful';
 *   - simulator-run rows are identified by the exact simulator message;
 *   - seed-fixture rows are identified by the exact seed message;
 *   - any other 'successful' message is reported but left untouched;
 *   - campaign stats are recomputed for every touched campaign.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const apply = process.argv.includes("--apply");

if ((process.env.NEON_BRANCH ?? "").toLowerCase() === "production") {
  console.error("REFUSED: NEON_BRANCH=production. This repair is development-only.");
  process.exit(1);
}

const SIM_MESSAGE = "Form submitted and confirmed by destination.";
const SEED_MESSAGE = "Registration accepted and acknowledged by the destination form";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set.");
  process.exit(1);
}
console.log(`target: ${new URL(url).host}`);
console.log(`mode: ${apply ? "APPLY (will modify rows)" : "dry run (no changes)"}`);

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();

  const result = await client.query(`
    select id, campaign_id, result_message, submission_evidence
      from public.campaign_records
     where status = 'successful'
  `);
  const repair = result.rows.filter((row) => {
    const e = row.submission_evidence;
    return !e || typeof e !== "object" || Array.isArray(e) ||
      typeof e.provider !== "string" || typeof e.submittedAt !== "string" ||
      typeof e.finalUrl !== "string" || typeof e.confirmationType !== "string" ||
      typeof e.workerRunId !== "string" || typeof e.attemptId !== "string";
  });
  const verified = result.rows.filter((row) => !repair.includes(row));

  console.log(`successful rows inspected: ${result.rows.length}`);
  console.log(`successful rows without valid evidence (will repair): ${repair.length}`);
  console.log(`evidenced successful rows (left untouched): ${verified.length}`);

  if (!apply) {
    console.log("dry run complete — re-run with --apply to repair.");
    return;
  }

  const touch = async (rows, note) => {
    for (const r of rows) {
      await client.query(
        `update public.campaign_records
            set status = 'unverified',
                result_message = $2,
                updated_at = now()
          where id = $1::uuid`,
        [r.id, note],
      );
    }
  };

  await client.query("begin");
  try {
    await touch(
      repair,
      "Outcome was simulated or lacked destination evidence — NOT a verified external submission. Re-run through the real worker to verify.",
    );
    await touch(
      seed.rows,
      "Demo fixture — NOT a verified external submission.",
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }

  const campaigns = new Set(repair.map((r) => r.campaign_id));
  for (const campaignId of campaigns) {
    const rows = await client.query(
      `select status, count(*)::int n from public.campaign_records
        where campaign_id = $1::uuid group by 1`,
      [campaignId],
    );
    const stats = { total: 0 };
    for (const row of rows.rows) {
      stats[row.status] = row.n;
      stats.total += row.n;
    }
    await client.query(
      `update public.campaigns set stats = $2::jsonb, updated_at = now() where id = $1::uuid`,
      [campaignId, JSON.stringify(stats)],
    );
    console.log(`recomputed stats for campaign ${campaignId}: ${JSON.stringify(stats)}`);
  }

  console.log(`repaired ${repair.length} rows across ${campaigns.size} campaign(s).`);
}

main()
  .catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
