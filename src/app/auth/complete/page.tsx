import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth";
import { SessionCompletion } from "@/app/auth/complete/SessionCompletion";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

function safeInternalNext(value: string | undefined): string {
  if (!value) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded, "https://workflow.invalid");
    const protectedPrefixes = [
      "/dashboard",
      "/billing",
      "/campaigns",
      "/communications",
      "/contacts",
      "/form-operations",
      "/imports",
      "/onboarding",
      "/operations",
      "/profile-completion",
      "/reports",
      "/settings",
      "/teams",
      "/templates",
    ];
    const isProtected = protectedPrefixes.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    );
    if (url.origin === "https://workflow.invalid" && isProtected && decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded;
    }
  } catch {
    // Fall through to the safe dashboard default.
  }
  return "/dashboard";
}

export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (authMode() !== "clerk") redirect("/login");
  const { next } = await searchParams;
  return <AuthShell eyebrow="Secure session" logoHref="/auth/complete"><SessionCompletion next={safeInternalNext(next)} /></AuthShell>;
}
