import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import * as Sentry from "@sentry/tanstackstart-react";
import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    Sentry.captureException(error, { tags: { boundary: "request_middleware" } });
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const clerkConfigured = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);
// Collect all trusted origins for Clerk JWT azp validation.
// Vercel exposes different URL vars per environment:
//   VERCEL_URL              = deployment-specific (preview-<hash>.vercel.app)
//   VERCEL_BRANCH_URL       = branch-specific (*-git-<branch>.vercel.app)
//   VERCEL_PROJECT_PRODUCTION_URL = production domain (diplomatglobal.com)
// All three may differ; the Clerk JWT azp matches whichever URL the user
// authenticated from, so we must include all of them.
const vercelUrls = [
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .filter(Boolean)
  .map((url) => `https://${url}`);

const authorizedParties = [
  ...(process.env.CLERK_AUTHORIZED_PARTIES ?? "").split(","),
  import.meta.env.VITE_SITE_URL ?? "",
  ...vercelUrls,
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
      ]),
]
  .map((origin) => origin.trim())
  .filter(Boolean)
  // Deduplicate (VITE_SITE_URL may overlap with VERCEL_PROJECT_PRODUCTION_URL)
  .filter((origin, i, arr) => arr.indexOf(origin) === i);
export const startInstance = createStart(() => ({
  requestMiddleware: [
    ...(clerkConfigured ? [clerkMiddleware({ authorizedParties })] : []),
    errorMiddleware,
  ],
}));
