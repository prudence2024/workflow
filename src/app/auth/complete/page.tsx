import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth";
import { SessionCompletion } from "@/app/auth/complete/SessionCompletion";

export const dynamic = "force-dynamic";

function safeInternalNext(value: string | undefined): string {
  if (!value) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    // Fall through to the dashboard default.
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
  return <SessionCompletion next={safeInternalNext(next)} />;
}
