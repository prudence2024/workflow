import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextProxy } from "next/server";

/**
 * Next.js 16 renamed the middleware file convention to `proxy`.
 *
 * Clerk's proxy is mounted ONLY when its keys are present. With no keys the
 * proxy is a pass-through, which is the correct behaviour for a developer
 * machine running the transitional bridge. It is NOT a production fallback:
 * src/lib/auth.ts treats a production process without Clerk keys as
 * "unconfigured" and refuses every session, so a misconfigured production
 * deployment is unauthenticated rather than silently password-authenticated.
 */
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

const clerkProxy = clerkConfigured ? clerkMiddleware() : null;

export const proxy: NextProxy = (request, event) => {
  if (request.nextUrl.pathname === "/dashboard") {
    console.info("[auth] proxy dashboard request", {
      clerkConfigured,
      clerkMiddlewareMounted: Boolean(clerkProxy),
    });
  }
  if (clerkProxy) return clerkProxy(request, event);
  return NextResponse.next();
};

export const config = {
  matcher: [
    // Skip Next internals and static assets; Clerk only needs to see app routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
