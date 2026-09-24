import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecords, campaigns, contacts } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";

/**
 * This module simulates the outcome of the queued, worker-driven submission
 * engine described in the architecture (Run Campaign -> Job -> Queue ->
 * Worker -> Browser Automation -> Result -> Database). In this sandboxed
 * environment there is no live queue/worker/Playwright infrastructure, so
 * outcomes are generated deterministically-at-random to exercise every
 * status, retry, and reporting path the same way real automation would.
 *
 * Swapping this module for a real BullMQ/Playwright worker later requires no
 * changes to the data model or UI — only this function's implementation.
 */

const FAILURE_CATEGORIES = ["invalid_data", "field_unavailable", "page_changed", "network_failure", "destination_unavailable"];

const MAX_ATTEMPTS = 3;

function pickOutcome(attempts: number): { status: string; failureCategory?: string; resultMessage: string } {
  const roll = Math.random();
  if (roll < 0.72) {
    return { status: "successful", resultMessage: "Form submitted and confirmed by destination." };
  }
  if (roll < 0.82) {
    if (attempts < MAX_ATTEMPTS) {
      return { status: "retrying", resultMessage: "Temporary network failure — scheduled for retry with backoff." };
    }
    return { status: "failed", failureCategory: "network_failure", resultMessage: "Retry attempts exhausted — needs attention." };
  }
  if (roll < 0.9) {
    return { status: "human_action_required", resultMessage: "Verification challenge detected — automation stopped safely." };
  }
  const category = FAILURE_CATEGORIES[Math.floor(Math.random() * FAILURE_CATEGORIES.length)];
  return { status: "failed", failureCategory: category, resultMessage: `Submission failed: ${category.replace(/_/g, " ")}.` };
}

export async function processCampaignRecords(orgId: string, campaignId: string) {
  const pending = await db
    .select({
      id: campaignRecords.id,
      attempts: campaignRecords.attempts,
      contactId: campaignRecords.contactId,
      firstName: contacts.firstName,
    })
    .from(campaignRecords)
    .innerJoin(contacts, eq(campaignRecords.contactId, contacts.id))
    .where(
      and(
        eq(campaignRecords.orgId, orgId),
        eq(campaignRecords.campaignId, campaignId),
        sql`${campaignRecords.status} in ('queued','retrying')`,
      ),
    );

  for (const record of pending) {
    const attempts = record.attempts + 1;
    const outcome = pickOutcome(attempts);

    await db
      .update(campaignRecords)
      .set({
        status: outcome.status,
        failureCategory: outcome.failureCategory ?? null,
        resultMessage: outcome.resultMessage,
        attempts,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignRecords.id, record.id));

    await logActivity({
      orgId,
      contactId: record.contactId,
      campaignId,
      type: `submission_${outcome.status}`,
      message: `${outcome.resultMessage}`,
    });
  }

  if (pending.length > 0) {
    await incrementUsage(orgId, "submissions", pending.length);
  }

  await recomputeCampaignStats(orgId, campaignId);
  return pending.length;
}

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
  };
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  await db.update(campaigns).set({ stats, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  return stats;
}

export async function resetFailedRecords(orgId: string, campaignId: string) {
  const ids = await db
    .select({ id: campaignRecords.id })
    .from(campaignRecords)
    .where(and(eq(campaignRecords.orgId, orgId), eq(campaignRecords.campaignId, campaignId), eq(campaignRecords.status, "failed")));
  if (ids.length === 0) return 0;
  await db
    .update(campaignRecords)
    .set({ status: "queued", failureCategory: null, resultMessage: "Manually requeued for retry." })
    .where(
      and(
        eq(campaignRecords.campaignId, campaignId),
        inArray(
          campaignRecords.id,
          ids.map((i) => i.id),
        ),
      ),
    );
  return ids.length;
}
