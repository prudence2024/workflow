import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecords, campaigns } from "@/db/schema";
import { logActivity } from "@/lib/activity";

/**
 * Campaign record helpers — stats and manual requeue ONLY.
 *
 * The former Math.random() outcome simulator lived here and has been
 * REMOVED. There is no execution path in this module that writes a
 * submission outcome: outcomes are written exclusively by the real
 * Playwright worker (`scripts/form-worker.mjs`), which only marks a record
 * `successful` together with destination-observed confirmation evidence
 * (`submission_evidence`). "Run campaign" enqueues durable work and returns
 * promptly; it never submits anything synchronously.
 */

export async function recomputeCampaignStats(orgId: string, campaignId: string) {
  const rows = await db
    .select({ status: campaignRecords.status, count: sql<number>`count(*)::int` })
    .from(campaignRecords)
    .where(and(eq(campaignRecords.orgId, orgId), eq(campaignRecords.campaignId, campaignId)))
    .groupBy(campaignRecords.status);

  const stats: Record<string, number> = {
    total: 0,
    queued: 0,
    processing: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    retrying: 0,
    cancelled: 0,
    human_action_required: 0,
    needs_attention: 0,
    unverified: 0,
  };
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  await db.update(campaigns).set({ stats, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  return stats;
}

export async function resetFailedRecords(orgId: string, campaignId: string) {
  return db.transaction(async (tx) => {
    const ids = await tx
      .select({ id: campaignRecords.id })
      .from(campaignRecords)
      .where(and(eq(campaignRecords.orgId, orgId), eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.status, "failed")));
    if (ids.length === 0) return 0;
    await tx
      .update(campaignRecords)
      .set({ status: "queued", failureCategory: null, resultMessage: "Manually requeued for retry." })
      .where(
        and(
          eq(campaignRecords.orgId, orgId),
          eq(campaignRecords.campaignId, campaignId),
          inArray(
            campaignRecords.id,
            ids.map((i) => i.id),
          ),
        ),
      );

    // A completed/failed lifecycle with queued records is stale: the next run
    // must be explicitly queued again, and the worker only claims running
    // campaigns. Never change an active run here.
    await tx
      .update(campaigns)
      .set({ status: "ready", audienceSnapshotId: null, updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.orgId, orgId),
          inArray(campaigns.status, ["completed", "failed"]),
        ),
      );
    return ids.length;
  });
}

/** Park an ambiguous record for human review — never auto-retried, never successful. */
export async function parkRecordForReview(
  orgId: string,
  campaignId: string,
  recordId: string,
  message: string,
) {
  await db
    .update(campaignRecords)
    .set({ status: "needs_attention", resultMessage: message, updatedAt: new Date() })
    .where(
      and(
        eq(campaignRecords.id, recordId),
        eq(campaignRecords.orgId, orgId),
        eq(campaignRecords.campaignId, campaignId),
      ),
    );
  await logActivity({ orgId, campaignId, type: "submission_needs_attention", message });
}
