export type PostAuthRoute =
  | "/login"
  | "/onboarding?step=workspace"
  | "/profile-completion?next=/dashboard"
  | "/dashboard";

/**
 * The post-authentication decision is intentionally based on trusted server
 * facts, not on whether a profile has first/last name fields yet. Those fields
 * are collected by onboarding, so a new authenticated user without a
 * workspace must be allowed to enter onboarding.
 *
 * The existing onboarding workspace screen is also the invitation surface for
 * pending invites, so invitation routing stays inside that flow until the
 * invite is accepted.
 */
export function resolvePostAuthRoute(input: {
  authenticated: boolean;
  hasPendingInvitation: boolean;
  hasWorkspace: boolean;
  /** Existing workspace members may still need the profile-completion step. */
  profileComplete?: boolean;
}): PostAuthRoute {
  if (!input.authenticated) return "/login";
  if (input.hasPendingInvitation && !input.hasWorkspace) return "/onboarding?step=workspace";
  if (!input.hasWorkspace) return "/onboarding?step=workspace";
  if (input.profileComplete === false) return "/profile-completion?next=/dashboard";
  return "/dashboard";
}
