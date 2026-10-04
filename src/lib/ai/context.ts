import "server-only";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { inWorkspace, type Workspace } from "@/lib/data";
import { assertPlanCapability, reserveAiRequest as reserveRequest } from "@/lib/planLimits";
import { type PlanCapability } from "@/lib/plans";

export async function requireAiWorkspace(): Promise<Workspace> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  return { user, org };
}

export async function requireAiCapability(workspace: Workspace, capability: PlanCapability): Promise<void> {
  await inWorkspace(workspace, (tx) => assertPlanCapability(tx, workspace.org.orgId, capability));
}

export async function reserveAiRequest(workspace: Workspace): Promise<void> {
  await inWorkspace(workspace, (tx) => reserveRequest(tx, workspace.org.orgId));
}