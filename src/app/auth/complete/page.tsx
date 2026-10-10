import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth";
import { SessionCompletion } from "@/app/auth/complete/SessionCompletion";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

function safeInternalNext(value: string | undefined): string {
  if (!value) return "/onboarding";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    // Fall through to the onboarding default.
  }
  return "/onboarding";
}

export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (authMode() !== "clerk") redirect("/login");
  const { next } = await searchParams;
  return <AuthShell eyebrow="Secure session"><SessionCompletion next={safeInternalNext(next)} /></AuthShell>;
}
