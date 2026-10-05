export const SESSION_COMPLETION_INTERVAL_MS = 750;
export const SESSION_COMPLETION_MAX_ATTEMPTS = 15;

export type SessionStatus = {
  authenticated: boolean;
  userReady: boolean;
};

export type SessionCompletionDecision = "ready" | "signed_out" | "retry" | "recovery";

export function decideSessionCompletion(input: {
  server: SessionStatus;
  clientSignedIn: boolean;
  attempts: number;
}): SessionCompletionDecision {
  if (!input.clientSignedIn) return "signed_out";
  if (input.server.authenticated && input.server.userReady) return "ready";
  if (input.attempts >= SESSION_COMPLETION_MAX_ATTEMPTS) return "recovery";
  return "retry";
}
