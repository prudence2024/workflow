export type CampaignStats = Record<string, number>;

export type CampaignPresentation = {
  key: string;
  label: string;
  message: string;
  pending: number;
  successful: number;
  total: number;
};

function n(stats: CampaignStats, key: string): number {
  return Math.max(0, Number(stats[key] ?? 0));
}

/**
 * Derives truthful campaign language from lifecycle plus authoritative record
 * counts. Stored lifecycle values remain unchanged for compatibility with the
 * worker and existing database constraints.
 */
export function campaignPresentation(lifecycle: string, stats: CampaignStats): CampaignPresentation {
  const total = n(stats, "total");
  const successful = n(stats, "successful");
  const failed = n(stats, "failed");
  const needsAttention = failed + n(stats, "human_action_required") + n(stats, "needs_attention");
  const pending = n(stats, "queued") + n(stats, "retrying") + n(stats, "processing");
  const retrying = n(stats, "retrying");
  const processing = n(stats, "processing");
  const unverified = n(stats, "unverified");
  const skipped = n(stats, "skipped");

  if (lifecycle === "archived") return { key: "archived", label: "Archived", message: "Archived and preserved for history.", pending, successful, total };
  if (lifecycle === "draft") return { key: "draft", label: "Draft", message: total > 0 ? `Draft audience: ${total} record${total === 1 ? " is" : "s are"} staged; configuration is not ready to run.` : "Configuration is incomplete. It does not send anything.", pending, successful, total };
  if (lifecycle === "ready") return { key: "ready", label: "Ready", message: total > 0 ? `Mapping is saved. ${total} audience record${total === 1 ? " is" : "s are"} ready; nothing is submitted until you choose Queue run.` : "Form mapping is saved and the campaign is ready to queue.", pending, successful, total };
  if (lifecycle === "running" && pending > 0) return { key: "running", label: "Running", message: `${successful} of ${total} submissions confirmed. ${pending} record${pending === 1 ? " is" : "s are"} still in execution.`, pending, successful, total };
  if (lifecycle === "paused") return { key: "paused", label: "Paused", message: pending > 0 ? `${successful} of ${total} submissions confirmed. ${pending} record${pending === 1 ? " is" : "s are"} pending after the run was paused.` : "Execution is paused; review the recorded outcomes before resuming.", pending, successful, total };
  if (lifecycle === "cancelled") return { key: "cancelled", label: "Cancelled", message: `${successful} of ${total} submissions confirmed. The campaign was intentionally stopped.`, pending, successful, total };

  if (pending > 0) {
    const retryPending = retrying > 0 && processing === 0;
    const label = retryPending ? "Retry pending" : "Queued";
    const message = retryPending
      ? `${successful} of ${total} submissions confirmed. ${retrying} failed record${retrying === 1 ? " is" : "s are"} queued for another attempt.`
      : `${successful} of ${total} submissions confirmed. ${pending} record${pending === 1 ? " is" : "s are"} awaiting execution.`;
    return { key: retryPending ? "retrying" : "queued", label, message, pending, successful, total };
  }
  if (total === 0) return { key: lifecycle === "completed" ? "needs_attention" : lifecycle, label: lifecycle === "completed" ? "Needs attention" : lifecycle, message: "No audience records exist for this campaign.", pending, successful, total };
  if (successful === total) return { key: "completed", label: "Completed successfully", message: `${successful} of ${total} submissions confirmed by the destination.`, pending, successful, total };
  if (needsAttention > 0 && successful > 0) return { key: "needs_attention", label: "Completed with issues", message: `${successful} of ${total} submissions confirmed. ${needsAttention} require attention.`, pending, successful, total };
  if (unverified > 0 && successful === 0) return { key: "unverified", label: "Unverified", message: `${successful} of ${total} submissions confirmed. ${unverified} outcome${unverified === 1 ? " is" : "s are"} unverified.`, pending, successful, total };
  if (failed === total) return { key: "failed", label: "Failed", message: `${failed} of ${total} submissions failed. No destination-confirmed submissions.`, pending, successful, total };
  if (skipped + needsAttention === total) return { key: "needs_attention", label: "Needs attention", message: `${successful} of ${total} submissions confirmed. Review skipped or unresolved records.`, pending, successful, total };
  return { key: "needs_attention", label: "Completed with issues", message: `${successful} of ${total} submissions confirmed. Review the remaining outcomes.`, pending, successful, total };
}
