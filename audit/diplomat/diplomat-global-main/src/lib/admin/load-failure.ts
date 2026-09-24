/**
 * Loader/serverFn failure → truthful user-facing reason.
 *
 * Admin routes that fan out to several serverFns used to swallow rejections
 * and render a permanent "Loading..." card. A denied permission and a real
 * provider/DB error must be distinguishable to the admin, so failures are
 * mapped here instead of being dropped.
 */

/**
 * Admin serverFns report authorization/DB failures by RETURNING an error
 * (`{ data: null, error: "Missing permission: analytics.view" }`) instead of
 * throwing. A loader that only inspects rejections therefore renders a
 * misleading "no data" state for a denied account — this extracts the
 * returned reason so the UI can say what actually happened.
 */
export function serverFnFailure(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as { error?: unknown; message?: unknown; ok?: unknown };
  if (typeof r.error === "string" && r.error.trim()) return r.error.trim();
  if (r.ok === false && typeof r.message === "string" && r.message.trim()) {
    return r.message.trim();
  }
  return null;
}

export function describeLoadFailure(reason: unknown): string {
  const message =
    reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  if (/missing permission/i.test(message)) {
    return "Your role does not include permission to view analytics.";
  }
  if (!message.trim()) return "Analytics could not be loaded.";
  return message.slice(0, 200);
}
