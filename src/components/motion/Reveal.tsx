"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.dataset.revealReady = "true";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.dataset.revealVisible = "true";
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        element.dataset.revealVisible = "true";
        observer.disconnect();
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -32px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }} data-reveal-visible={visible ? "true" : undefined}>{children}</div>;
}
