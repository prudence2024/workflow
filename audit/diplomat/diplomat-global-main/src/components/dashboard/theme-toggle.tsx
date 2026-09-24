"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("dashboard-theme");
    setIsDark(saved ? saved === "dark" : true);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem("dashboard-theme", newDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", newDark);

    // Notify the layout component
    window.dispatchEvent(
      new CustomEvent("dashboard-theme-change", {
        detail: { dark: newDark },
      }),
    );
  };

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 hover:bg-gray-100 dark:hover:bg-[#222226] rounded-full transition-colors"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      <Sun className="h-5 w-5 text-gray-600 dark:text-gray-300 transition-all dark:hidden" />
      <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300 transition-all hidden dark:block" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
