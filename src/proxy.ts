import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const CLERK_SESSION_COOKIE = "__session";

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

function hasClerkSessionCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${CLERK_SESSION_COOKIE}=`));
}

function safeRequestOrigin(request: Request): string | null {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("host");
  if (!host) return null;
  return `${forwardedProto || "https"}://${host}`;
}

/**
 * Clerk's canonical Next.js 16 Proxy integration.
 *
 * The dynamic options callback is intentional: Cloudflare build-time output
 * does not have runtime secrets, while the Worker does. Reading these values
 * per request prevents the build environment from freezing Clerk as absent.
 */
export default clerkMiddleware(
  async (auth, request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/dashboard") {
      const authorizedParties = parseAuthorizedParties(process.env.CLERK_AUTHORIZED_PARTIES);
      let authState: { userId?: string | null; sessionId?: string | null } = {};
      let authResolution: "success" | "failure" = "success";
      try {
        authState = await auth();
      } catch (error) {
        authResolution = "failure";
        const value = error as { name?: unknown; code?: unknown; message?: unknown };
        console.error("[auth] Clerk proxy auth diagnostic failure", {
          errorName: typeof value?.name === "string" ? value.name : "UnknownError",
          errorCode: typeof value?.code === "string" ? value.code : null,
          safeMessage: "Clerk authentication resolution failed",
        });
      }
      const requestOrigin = safeRequestOrigin(request);
      console.info("[auth] Clerk proxy diagnostic", {
        clerkConfigured: Boolean(process.env.CLERK_SECRET_KEY),
        publishableKeyPresent: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
        secretKeyPresent: Boolean(process.env.CLERK_SECRET_KEY),
        clerkMiddlewareRan: true,
        sessionCookiePresent: hasClerkSessionCookie(request),
        authUserIdPresent: Boolean(authState.userId),
        authSessionIdPresent: Boolean(authState.sessionId),
        authResolution,
        requestHost: request.headers.get("host") ?? null,
        requestOrigin,
        authorizedPartyMatch: authorizedParties.length === 0 ? null : Boolean(requestOrigin && authorizedParties.includes(requestOrigin)),
      });
    }
    const response = NextResponse.next();
    const requestUrl = new URL(request.url);
    const isRsc = request.headers.get("RSC") === "1" || requestUrl.searchParams.has("_rsc");
    const isServerAction = request.method !== "GET" || request.headers.has("Next-Action");
    // Dynamic HTML, RSC payloads and Server Actions must never be served from
    // a cache entry produced by a different OpenNext deployment. Hashed
    // _next assets remain cacheable by the Workers asset handler.
    if (isRsc || isServerAction || !requestUrl.pathname.startsWith("/_next/")) {
      response.headers.set("Cache-Control", "no-store, max-age=0");
      response.headers.set("Vary", "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, Next-Action");
    }
    return response;
  },
  () => {
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const authorizedParties = parseAuthorizedParties(process.env.CLERK_AUTHORIZED_PARTIES);
    return {
      ...(publishableKey ? { publishableKey } : {}),
      ...(authorizedParties.length ? { authorizedParties } : {}),
      ...(process.env.CLERK_ENCRYPTION_KEY && process.env.CLERK_SECRET_KEY
        ? { secretKey: process.env.CLERK_SECRET_KEY }
        : {}),
      signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/login",
      signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/signup",
    };
  },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes.
    "/__clerk/(.*)",
  ],
};
