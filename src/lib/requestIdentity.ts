import "server-only";

import { createClerkClient } from "@clerk/backend";

export type RequestIdentitySource = "clerk-cookie" | "clerk-bearer";

export type ResolvedRequestIdentity = {
  clerkUserId: string;
  sessionId: string;
  source: RequestIdentitySource;
};

function parseAuthorizedParties(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .map((origin) => {
      try {
        const url = new URL(origin);
        const isLocalDevelopmentHttp =
          process.env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1");
        if ((!isLocalDevelopmentHttp && url.protocol !== "https:") || url.username || url.password) return null;
        return url.origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Resolve either a normal Clerk browser session or a native Clerk bearer
 * session. Clerk performs signature, expiry, issuer and session-token checks;
 * the explicit authorized-party list prevents accepting a token minted for an
 * unrelated frontend origin. No caller-supplied user or workspace id is used.
 */
export async function resolveRequestIdentity(
  request: Request,
): Promise<ResolvedRequestIdentity | null> {
  const token = bearerToken(request);
  const authorization = request.headers.get("authorization");
  if (authorization && !token) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  const authorizedParties = parseAuthorizedParties(process.env.CLERK_AUTHORIZED_PARTIES);
  if (authorizedParties.length === 0) {
    throw new Error("CLERK_AUTHORIZED_PARTIES is required for request-token authentication");
  }

  const client = createClerkClient({
    secretKey,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const state = await client.authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties,
  });

  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  if (!auth.userId || !auth.sessionId) return null;

  return {
    clerkUserId: auth.userId,
    sessionId: auth.sessionId,
    source: token ? "clerk-bearer" : "clerk-cookie",
  };
}

export function extractBearerToken(request: Request): string | null {
  return bearerToken(request);
}
