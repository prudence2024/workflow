import "server-only";

import { auth } from "@clerk/nextjs/server";
import { authMode, getCurrentUser } from "@/lib/auth";

/**
 * Public marketing pages only need to know whether a trusted identity exists.
 * Do not provision a local profile, resolve workspaces, or query tenant data
 * just to choose a navigation CTA.
 */
export async function hasMarketingSession(): Promise<boolean> {
  if (authMode() === "clerk") {
    try {
      return Boolean((await auth()).userId);
    } catch {
      return false;
    }
  }

  // The legacy bridge is development-only; preserve its local behavior.
  return Boolean(await getCurrentUser().catch(() => null));
}
