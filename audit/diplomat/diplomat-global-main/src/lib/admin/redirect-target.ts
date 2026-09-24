/**
 * Post-login destination resolver.
 *
 * Why this exists: the admin login route used to send a signed-in user to a
 * hardcoded "/dashboard". When a deep link (e.g. /dashboard/analytics) hit a
 * stale session, the request was resolved as unauthenticated and rendered on
 * the login route; Clerk then re-established the session client-side and the
 * hardcoded redirect threw the deep link away — the user landed on /dashboard
 * and only a manual retry reached the page they asked for.
 *
 * The fix is to carry the originally requested path to the login route and
 * honor it — which means the destination is now attacker-controlled input and
 * must be validated. Only a same-origin, root-relative path without a scheme
 * is ever returned; everything else falls back to the dashboard.
 *
 * Pure and dependency-free so the contract is unit-testable.
 */

const FALLBACK = "/dashboard";

/** Longest destination we will honor. Anything longer is not a real deep link. */
const MAX_LENGTH = 512;

/** Control characters can be used to truncate/smuggle a value past naive checks. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** A scheme (e.g. `javascript:`, `data:`) smuggled after the leading slash. */
const SCHEME_IN_FIRST_SEGMENT = /^\/[^/?#]*:/;

/** Paths that would bounce straight back to login (redirect-loop protection). */
const AUTH_BOUNDARY = /^\/admin\/login(?:$|[/?#])/;

export function resolveAdminRedirectTarget(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK;

  let value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return FALLBACK;

  // Decode once so `%2F%2Fevil.example` cannot pass as a relative path, then
  // re-validate the decoded form.
  if (/%[0-9a-fA-F]{2}/.test(value)) {
    try {
      value = decodeURIComponent(value).trim();
    } catch {
      return FALLBACK;
    }
  }

  if (!value.startsWith("/")) return FALLBACK;
  if (value.length > MAX_LENGTH) return FALLBACK;
  if (hasControlChar(value)) return FALLBACK;
  // `//host` and `/\host` are protocol-relative / backslash host tricks.
  if (value.startsWith("//") || value.startsWith("/\\")) return FALLBACK;
  // A backslash anywhere is treated as hostile: browsers normalize it to `/`.
  if (value.includes("\\")) return FALLBACK;
  if (SCHEME_IN_FIRST_SEGMENT.test(value)) return FALLBACK;
  if (AUTH_BOUNDARY.test(value)) return FALLBACK;

  return value;
}
