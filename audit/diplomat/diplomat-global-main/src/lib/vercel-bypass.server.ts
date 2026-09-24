/**
 * Vercel Preview Protection Bypass — cookie setter.
 *
 * When VERCEL_AUTOMATION_BYPASS_SECRET is set and the deployment is NOT
 * production, sets the x-vercel-protection-bypass cookie so subsequent
 * browser navigation (e.g. callback → order-success) passes Vercel
 * Deployment Protection without needing the query parameter on every URL.
 *
 * NEVER applies to Production.
 * NEVER logs or exposes the secret value.
 */
import { setResponseHeader } from "@tanstack/react-start/server";

/**
 * Set the Vercel bypass cookie on the current response.
 * Call this from a TanStack Start createServerFn handler.
 * No-op if not in a Preview deployment or if the secret is not configured.
 */
export function setVercelBypassCookie(): void {
  if (typeof process === "undefined") return;
  const env = process.env;
  const isProduction = env.VERCEL_ENV === "production";
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (isProduction || !bypassSecret) return;

  try {
    const cookieValue = `x-vercel-protection-bypass=${bypassSecret}; Path=/; Secure; SameSite=Lax; Max-Age=600`;
    setResponseHeader("Set-Cookie", cookieValue);
  } catch {
    // Non-fatal — if cookie can't be set, the query parameter approach
    // on the callback URL already handles the initial navigation.
  }
}
