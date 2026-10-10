import { getCampaignStatus } from "@/lib/data";
import { getRequestWorkspaceContext } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

/** Small authenticated status surface; it deliberately does not return records or RSC data. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, currentOrg: org } = await getRequestWorkspaceContext();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (!org) return Response.json({ error: "Workspace required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

  const { id } = await params;
  const status = await getCampaignStatus({ user, org }, id);
  if (!status.campaign) return Response.json({ error: "Campaign not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

  return Response.json(status, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
