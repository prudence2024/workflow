/**
 * Admin role label — single source of truth for how a server-resolved role key
 * is displayed in the admin shell.
 *
 * The dashboard route's `beforeLoad` resolves the admin's role from the
 * database (`admin_users.roles.key`) and exposes it through route context.
 * The UI must render THAT value. Hardcoding "Owner"/"Administrator" made the
 * menu claim a role the server never granted, which is misleading during
 * exactly the situation where trust matters most (an account with no role).
 */

export const NO_ROLE_LABEL = "No role assigned";

/** Turn a server-resolved role key ("owner", "editor") into a display label. */
export function formatAdminRoleLabel(role?: string | null): string {
  if (typeof role !== "string") return NO_ROLE_LABEL;
  const key = role.trim();
  if (!key) return NO_ROLE_LABEL;
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
}
