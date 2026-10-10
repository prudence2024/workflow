"use client";

import { useEffect, useRef, useState } from "react";

const VARIANTS = [
  ["Automate with control", "Run workflows with visibility, evidence, and human oversight."],
  ["Move operations faster", "Keep records, campaigns, and operations aligned in one connected system."],
  ["Work with visibility", "Connect your records and keep every outcome visible to the people doing the work."],
] as const;

export function HeroCopy() {
  const [active, setActive] = useState(0);
  const [length, setLength] = useState(VARIANTS[0][0].length);
  const [deleting, setDeleting] = useState(false);
  const hold = useRef(0);
  const activeRef = useRef(active);
  const lengthRef = useRef(length);
  const deletingRef = useRef(deleting);
  activeRef.current = active;
  lengthRef.current = length;
  deletingRef.current = deleting;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = window.setInterval(() => {
      const title = VARIANTS[activeRef.current][0];
      if (!deletingRef.current && lengthRef.current < title.length) { setLength((value) => value + 1); return; }
      if (!deletingRef.current) {
        hold.current += 1;
        if (hold.current >= 28) { hold.current = 0; setDeleting(true); }
        return;
      }
      if (lengthRef.current > 0) { setLength((value) => value - 1); return; }
      setActive((value) => (value + 1) % VARIANTS.length);
      setDeleting(false);
    }, 70);
    return () => window.clearInterval(id);
  }, []);

  const [title, description] = VARIANTS[active];
  return (
    <div className="min-h-[170px]" aria-live="polite">
      <h1 className="max-w-xl font-display text-[clamp(2.3rem,5vw,4rem)] font-semibold leading-[1.02] text-[var(--color-ink)]">{title.slice(0, length)}<span aria-hidden="true" className="ml-1 inline-block font-normal text-[var(--color-accent)] motion-safe:animate-pulse">|</span></h1>
      <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--color-muted)]">{description}</p>
    </div>
  );
}
