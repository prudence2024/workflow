"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = "workflow-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") return mode;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [initialized, setInitialized] = useState(false);
  const modeRef = useRef<ThemeMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextMode: ThemeMode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setModeState(nextMode);
    applyTheme(nextMode);
    setResolvedTheme(resolveTheme(nextMode));
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized || mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (modeRef.current !== "system") return;
      const resolved = resolveTheme("system");
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themeMode = "system";
      setResolvedTheme(resolved);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [initialized, mode]);

  function setMode(nextMode: ThemeMode) {
    setModeState(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
    applyTheme(nextMode);
    setResolvedTheme(resolveTheme(nextMode));
  }

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
