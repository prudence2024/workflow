import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  // Authentication is an app entry surface. Keep its brand navigation inside
  // the auth flow instead of sending an unfinished sign-in/sign-up attempt to
  // the public marketing homepage. This is deterministic on the first paint
  // in both the browser and the Capacitor WebView.
  return <AuthShell eyebrow="Authentication" logoHref="/login">{children}</AuthShell>;
}
