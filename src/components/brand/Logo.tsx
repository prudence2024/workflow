import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Workflow wordmark.
 *
 * The approved artwork is used as supplied — never redrawn, recoloured or
 * re-typeset. `wordmark.png` is the founder-approved board; the compact symbols
 * are the light/dark app icons from the same set. The original wordmark font is
 * NOT identified in the supplied assets, so no text-based brand lockup is
 * generated here; Manrope remains the provisional companion UI font.
 */

const ASSETS = {
  wordmark: "/brand/workflow-logo.png",
  iconLight: "/brand/icon-light.png",
  iconDark: "/brand/icon-dark.png",
} as const;

export function BrandMark({
  size = 32,
  tone = "light",
  className,
}: {
  size?: number;
  tone?: "light" | "dark";
  className?: string;
}) {
  // The transparent artwork avoids the white square/corner halo that appears
  // when the dark tile asset is placed on a light surface.
  const src = tone === "light" ? ASSETS.iconLight : ASSETS.iconDark;
  return (
    <Image
      src={src}
      alt="Workflow"
      width={size}
      height={size}
      priority
      className={cn("rounded-[8px] object-contain", className)}
    />
  );
}

export function BrandLockup({
  href = "/",
  tone = "light",
  size = 32,
  className,
}: {
  href?: string;
  tone?: "light" | "dark";
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size} tone={tone} />
      <span
        className={cn(
          "font-display text-[16.5px] font-semibold tracking-[-0.02em]",
          tone === "light" ? "text-[var(--color-ink)]" : "text-white",
        )}
      >
        Workflow
      </span>
    </Link>
  );
}

export function BrandWordmarkHero({ className }: { className?: string }) {
  return (
    <Image
      src={ASSETS.wordmark}
      alt="Workflow — approved brand wordmark"
      width={1448}
      height={1086}
      priority
      className={cn("h-auto w-full max-w-[420px]", className)}
    />
  );
}
