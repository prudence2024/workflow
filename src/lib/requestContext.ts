import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser, getUserOrganizations, type CurrentUser, type OrgMembership } from "@/lib/auth";

export type RequestWorkspaceContext = {
  user: CurrentUser | null;
  orgs: OrgMembership[];
  currentOrg: OrgMembership | null;
};

/**
 * React cache is request-scoped. It prevents the app shell and a nested page
 * from opening duplicate Clerk/profile/membership transactions, while every
 * returned membership still came from the RLS-verified database query.
 */
export const getRequestWorkspaceContext = cache(async (): Promise<RequestWorkspaceContext> => {
  const user = await getCurrentUser();
  if (!user) return { user: null, orgs: [], currentOrg: null };

  const orgs = await getUserOrganizations(user);
  const preferred = (await cookies()).get("fops_org")?.value;
  const currentOrg =
    (preferred ? orgs.find((org) => org.orgId === preferred) : undefined) ??
    orgs[0] ??
    null;

  return { user, orgs, currentOrg };
});
