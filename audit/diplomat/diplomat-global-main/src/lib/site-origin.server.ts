/**
 * Centralized canonical site origin.
 *
 * SINGLE source of truth for ALL absolute URLs in the application:
 * - canonical URLs / sitemap
 * - og:url, og:image, twitter:image
 * - JSON-LD URLs
 * - email links
 * - testimonial share links
 * - unsubscribe links
 *
 * When the production domain is configured, change ONLY this file.
 * All consumers import getSiteOrigin() and derive URLs from it.
 */

import { getDatabaseConfig } from "./database.server";

/**
 * Get the canonical site origin (e.g. "https://diplomatglobal.com").
 *
 * Priority:
 * 1. VITE_SITE_URL env var (set in Vercel/deployment)
 * 2. Hardcoded fallback for the current testing deployment
 *
 * IMPORTANT: Do NOT set VITE_SITE_URL to diplomatglobal.com until the
 * production domain is actually configured and DNS-ready.
 */
export function getSiteOrigin(): string {
  if (typeof process !== "undefined") {
    const env = process.env;
    // In Preview/branch deployments, VERCEL_URL gives the actual deployment host.
    // Use it so callbacks/webhooks/links point to the CURRENT deployment, not production.
    // In Production, VERCEL_URL is the same as the custom domain, so this is safe.
    if (env.VERCEL_ENV && env.VERCEL_ENV !== "production" && env.VERCEL_URL) {
      return `https://${env.VERCEL_URL}`;
    }
    if (env?.VITE_SITE_URL) {
      return env.VITE_SITE_URL.replace(/\/+$/, "");
    }
  }
  // Fallback — testing deployment origin
  return "https://diplomat-global.vercel.app";
}

/**
 * Build an absolute URL from a relative path.
 * Example: buildAbsoluteUrl("/reviews") → "https://diplomatglobal.com/reviews"
 */
export function buildAbsoluteUrl(path: string): string {
  const origin = getSiteOrigin();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}

/**
 * Get the canonical product URL.
 */
export function getProductUrl(slug: string): string {
  return buildAbsoluteUrl(`/products/${slug}`);
}

/**
 * Get the canonical blog post URL.
 */
export function getBlogPostUrl(slug: string): string {
  return buildAbsoluteUrl(`/blog/${slug}`);
}

/**
 * Get the public testimonial submission URL.
 */
export function getReviewSubmissionUrl(): string {
  return buildAbsoluteUrl("/reviews");
}

/**
 * Build Paystack callback URL with Vercel Preview Protection bypass.
 *
 * When VERCEL_AUTOMATION_BYPASS_SECRET is set and the deployment is NOT
 * production, appends the bypass query parameter so the callback page
 * is not blocked by Vercel Deployment Protection.
 *
 * NEVER applies to Production — only testing/preview deployments.
 * NEVER logs or exposes the secret value.
 */
export function getPaystackCallbackUrl(): string {
  const origin = getSiteOrigin();
  const base = `${origin}/checkout/callback`;
  // Only add bypass for non-production Preview deployments
  if (typeof process !== "undefined") {
    const env = process.env;
    const isProduction = env.VERCEL_ENV === "production";
    const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (!isProduction && bypassSecret) {
      return `${base}?x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}`;
    }
  }
  return base;
}

/**
 * Get the email unsubscribe URL.
 */
export function getUnsubscribeUrl(token: string): string {
  return buildAbsoluteUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);
}
