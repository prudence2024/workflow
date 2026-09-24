"use client";

import type { ReactNode } from "react";
import Sidebar from "./sidebar";
import TopNav from "./top-nav";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import "@/styles/dashboard.css";

interface LayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  const [mounted, setMounted] = useState(false);
  const [menuState, setMenuState] = useState<"full" | "collapsed" | "hidden">("full");
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("dashboard-theme");
    const shouldBeDark = saved ? saved === "dark" : true;
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle("dark", shouldBeDark);
  }, []);

  useEffect(() => {
    const checkMenuState = () => {
      if (typeof window !== "undefined") {
        if ((window as any).menuState) {
          setMenuState((window as any).menuState);
        }
        if ((window as any).isHovered !== undefined) {
          setIsHovered((window as any).isHovered);
        }
        if ((window as any).isMobile !== undefined) {
          setIsMobile((window as any).isMobile);
        }
      }
    };

    checkMenuState();
    // Event-driven sync (was: setInterval(checkMenuState, 50) — a 20x/second
    // re-render loop on every Admin page). The sidebar dispatches this event
    // whenever its mirrored state changes; no polling.
    window.addEventListener("dashboard-sidebar-state", checkMenuState);
    return () => window.removeEventListener("dashboard-sidebar-state", checkMenuState);
  }, []);

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent) => {
      const dark = e.detail.dark;
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    };
    window.addEventListener("dashboard-theme-change" as any, handleThemeChange as any);
    return () =>
      window.removeEventListener("dashboard-theme-change" as any, handleThemeChange as any);
  }, []);

  if (!mounted) {
    return null;
  }

  const getMarginLeft = () => {
    if (isMobile) {
      return "0";
    }
    if (menuState === "hidden") {
      return "0";
    }
    if (menuState === "collapsed" && isHovered) {
      return "16rem";
    }
    if (menuState === "collapsed") {
      return "4rem";
    }
    return "16rem";
  };

  return (
    <div data-dashboard className={cn("flex h-screen", isDark && "dark")}>
      <Sidebar />
      <div
        className="w-full flex flex-1 flex-col transition-all duration-300 ease-in-out min-w-0"
        style={{
          marginLeft: getMarginLeft(),
        }}
      >
        {/* Top nav — dark header surface */}
        <header className="h-16 border-b border-gray-200 dark:border-[#26262a] flex-shrink-0 bg-white dark:bg-[#141417]">
          <TopNav />
        </header>
        {/* Main content — page bg matches card bg, cards have visible outlines */}
        <main className="flex-1 overflow-auto p-3 sm:p-6 bg-gray-50 dark:bg-[#141417] min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
