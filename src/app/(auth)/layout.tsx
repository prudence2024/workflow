import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell eyebrow="Authentication">{children}</AuthShell>;
}
