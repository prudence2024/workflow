import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Formflow Ops — The form operations platform",
  description:
    "Import, validate, submit, track, communicate, and report on every form-driven process from one operational workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">{children}</body>
    </html>
  );
}
