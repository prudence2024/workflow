import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { StaleActionRecovery } from "@/components/runtime/StaleActionRecovery";
import { PwaRuntime } from "@/components/pwa/PwaRuntime";
import { WorkflowSplashGate } from "@/components/splash/WorkflowSplashGate";
import "./globals.css";

/**
 * Typography.
 *
 * Manrope is the PROVISIONAL companion UI font: the approved board's wordmark
 * font has not been identified from the supplied PNG, so no public build claims
 * it. Swap `--font-display` in globals.css once the licensed original is
 * supplied.
 */
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3111"),
  title: {
    default: "Workflow — All your operations. In flow.",
    template: "%s · Workflow",
  },
  description:
    "Manage records, automate processes, communicate through bulk email and SMS, organize campaigns, schedule reminders and report on operations — all in one multi-tenant workspace.",
  applicationName: "Workflow",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  // icon-light.png is the transparent-background W mark (icon-dark.png has a
  // baked-in white page background around its dark tile, which renders as a
  // white box in browser tabs). No logo redraw: same approved symbol.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Workflow — All your operations. In flow.",
    description: "Connect · Automate · Move Forward",
    type: "website",
    images: [{ url: "/branding/workflow-social-preview.png", width: 1731, height: 909, alt: "Workflow — All your operations. In flow." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Workflow — All your operations. In flow.",
    description: "Connect · Automate · Move Forward",
    images: ["/branding/workflow-social-preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3B",
};

/**
 * Clerk is mounted only when its keys are present. In production a missing key
 * pair is not a fallback signal — src/lib/auth.ts refuses every session in that
 * case — so wrapping the tree is purely plumbing, not an auth decision.
 */
function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <head>
        <Script id="workflow-theme" strategy="beforeInteractive">
          {`(() => { try { const m = localStorage.getItem('workflow-theme') || 'system'; const d = m === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m; const root = document.documentElement; root.dataset.theme = d; root.dataset.themeMode = m; root.style.colorScheme = d; } catch {} })()`}
        </Script>
      </head>
      <body className="bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">
        <ThemeProvider>
          <StaleActionRecovery />
          <WorkflowSplashGate />
          {clerkConfigured() ? <ClerkProvider>{children}</ClerkProvider> : children}
          <PwaRuntime />
        </ThemeProvider>
      </body>
    </html>
  );
}
