import { createServerFn } from "@tanstack/react-start";
import { getCloudinaryConfig } from "./cloudinary.server";
import { getDatabaseConfig } from "./database.server";
import { getRedisConfig } from "./redis.server";

function hasEnv(...names: string[]) {
  return names.every((name) => Boolean((process.env[name] ?? "").trim()));
}

/**
 * Reports which external services are configured from environment variables.
 * Returns booleans only — never exposes secret values.
 */
export const getServiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const resendConfigured = hasEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL", "CONTACT_OWNER_EMAIL");
  const resendDomain = process.env.RESEND_FROM_EMAIL?.trim()?.match(/@(.+)$/)?.[1] || null;
  // Domain verification cannot be checked via env vars alone — require explicit opt-in
  const resendDomainVerified = resendConfigured && process.env.RESEND_DOMAIN_VERIFIED === "true";
  return {
    clerk: hasEnv("CLERK_SECRET_KEY") && Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY),
    supabase: Boolean(getDatabaseConfig()),
    cloudinary: Boolean(getCloudinaryConfig()),
    resend: resendConfigured,
    resend_domain: resendDomain,
    resend_domain_verified: resendDomainVerified,
    resend_operational: resendConfigured && resendDomainVerified,
    brevo:
      hasEnv("BREVO_API_KEY") && Number.isSafeInteger(Number(process.env.BREVO_MARKETING_LIST_ID)),
    brevo_operational: false, // Not claimed operational without real send test
    redis: Boolean(getRedisConfig()),
    sentry: Boolean(process.env.SENTRY_DSN || import.meta.env.VITE_SENTRY_DSN),
  };
});
