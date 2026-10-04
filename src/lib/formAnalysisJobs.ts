import "server-only";

import { and, eq } from "drizzle-orm";
import { campaigns, formAnalysisJobs, type FormAnalysisJobStatus } from "@/db/schema";
import { assertFormUrlAllowed } from "@/lib/formUrlPolicy";
import { inWorkspace, type Workspace } from "@/lib/data";

export type QueueFormAnalysisResult = {
  status: FormAnalysisJobStatus;
  jobId: string;
  formUrl: string;
};

/**
 * Validate and enqueue rendered-DOM work. This function deliberately does not
 * import Playwright or spawn a process: Cloudflare only performs the durable
 * hand-off. The unique key makes rapid repeated submissions idempotent.
 */
export async function queueFormAnalysis(
  workspace: Workspace,
  campaignId: string,
  rawFormUrl: string,
): Promise<QueueFormAnalysisResult | null> {
  const allowed = await assertFormUrlAllowed(rawFormUrl);
  const formUrl = allowed.toString();
  const idempotencyKey = `form-analysis:${campaignId}:${formUrl}`;

  return inWorkspace(workspace, async (tx) => {
    const [campaign] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, workspace.org.orgId)))
      .limit(1);
    if (!campaign) return null;

    const [existing] = await tx
      .select({
        id: formAnalysisJobs.id,
        status: formAnalysisJobs.status,
      })
      .from(formAnalysisJobs)
      .where(eq(formAnalysisJobs.idempotencyKey, idempotencyKey))
      .limit(1);

    let jobId = existing?.id;
    let status = (existing?.status ?? "queued") as FormAnalysisJobStatus;

    if (!existing) {
      const [created] = await tx
        .insert(formAnalysisJobs)
        .values({
          orgId: workspace.org.orgId,
          campaignId,
          formUrl,
          idempotencyKey,
          status: "queued",
          diagnostics: [],
          result: {},
        })
        .returning({ id: formAnalysisJobs.id });
      jobId = created.id;
      status = "queued";
    } else if (existing.status === "failed" || existing.status === "needs_attention") {
      // A retry is explicit: the user submitted the analysis form again.
      await tx
        .update(formAnalysisJobs)
        .set({
          status: "queued",
          attempts: 0,
          lastError: null,
          diagnostics: [],
          result: {},
          nextAttemptAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          startedAt: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(formAnalysisJobs.id, existing.id));
      status = "queued";
    }

    await tx
      .update(campaigns)
      .set({
        formUrl,
        formAnalysisStatus: status === "ready" ? "ready" : status === "processing" ? "processing" : "queued",
        formAnalysisError: null,
        formAnalysisUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, workspace.org.orgId)));

    return { status, jobId: jobId!, formUrl };
  });
}

export function analysisStatusMessage(status: string, error?: string | null): string {
  if (status === "queued") return "Analysis queued. A Node browser worker will inspect the rendered form.";
  if (status === "processing") return "Analyzing the rendered form…";
  if (status === "ready") return "Form analysis completed.";
  if (status === "needs_attention") return error || "The form needs human review before it can be used.";
  if (status === "failed") return error || "Form analysis failed after the allowed retries.";
  return "";
}
