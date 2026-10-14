import { revalidatePath } from "next/cache";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { bestEffortCampaignActivity, campaignRunErrorMessage, CampaignNotFoundError, CampaignRunValidationError, startCampaignRun } from "@/lib/campaignRun";
import { PlanCapabilityError, PlanLimitError } from "@/lib/planLimits";
import { safeErrorDiagnostic } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function headers() {
  return { "Cache-Control": "no-store, max-age=0", Vary: "Authorization, Cookie" };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ success: false, error: "Invalid campaign id." }, { status: 400, headers: headers() });

  let user;
  try {
    user = await getCurrentUser(request);
  } catch (error) {
    console.error("[campaign-api] authentication failed", safeErrorDiagnostic(error));
    return Response.json({ success: false, error: "Authentication is temporarily unavailable." }, { status: 503, headers: headers() });
  }
  if (!user) return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: headers() });

  const org = await getCurrentOrg(user);
  if (!org) return Response.json({ success: false, error: "Workspace required." }, { status: 403, headers: headers() });

  try {
    const result = await startCampaignRun({ user, org }, id);
    await bestEffortCampaignActivity({
      write: () => logActivity({ orgId: org.orgId, campaignId: id, type: "campaign_started", message: `Campaign run started — ${result.queuedCount} record(s) queued for the submission worker` }),
      report: (error) => console.error("[campaign-api] activity log failed after committed run", {
        campaignId: id,
        orgId: org.orgId,
        error: safeErrorDiagnostic(error),
      }),
    });
    revalidatePath(`/campaigns/${id}`);
    return Response.json({ success: true, status: result.status, queuedCount: result.queuedCount }, { headers: headers() });
  } catch (error) {
    const message = campaignRunErrorMessage(error);
    console.error("[campaign-api] queue failed", { campaignId: id, orgId: org.orgId, error: safeErrorDiagnostic(error) });
    const status = error instanceof CampaignNotFoundError ? 404
      : error instanceof CampaignRunValidationError && error.code === "already_active" ? 409
      : error instanceof CampaignRunValidationError || error instanceof PlanLimitError || error instanceof PlanCapabilityError ? 422
      : 500;
    return Response.json({ success: false, error: message }, { status, headers: headers() });
  }
}
