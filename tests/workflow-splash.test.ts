import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Workflow splash integration", () => {
  it("keeps the supplied animation source set intact", () => {
    const sourceFiles = [
      "src/components/splash/WorkflowSplash.tsx",
      "src/components/splash/WorkflowSplashGate.tsx",
      "src/components/splash/WorkflowMark.tsx",
      "src/components/splash/WorkflowPaths.tsx",
      "src/components/splash/WorkflowModules.tsx",
      "src/components/splash/WorkflowWordmark.tsx",
      "src/components/splash/brand-paths.ts",
      "src/components/splash/splash-layout.ts",
      "src/hooks/useWorkflowSplashAnimation.ts",
      "src/styles/workflow-splash.css",
      "public/brand/workflow-mark.svg",
      "public/brand/workflow-logo.svg",
      "public/brand/workflow-logo-dark.svg",
    ];

    for (const file of sourceFiles) expect(existsSync(resolve(root, file))).toBe(true);
    expect(read("src/hooks/useWorkflowSplashAnimation.ts")).toContain('from "gsap"');
    expect(read("src/components/splash/splash-layout.ts")).toContain("TIMING");
  });

  it("mounts once from the persistent App Router root layout", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import { WorkflowSplashGate } from "@/components/splash/WorkflowSplashGate";');
    expect(layout).toContain("<WorkflowSplashGate />");
  });

  it("ships the supplied fail-safe and reduced-motion behavior", () => {
    const splash = read("src/components/splash/WorkflowSplash.tsx");
    const css = read("src/styles/workflow-splash.css");
    const animation = read("src/hooks/useWorkflowSplashAnimation.ts");

    expect(splash).toContain("maxDuration = 12000");
    expect(splash).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("wf-splash:not([data-managed])");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(animation).toContain("Never trap the user");
    expect(animation).toContain("safePlaybackSpeed");
    expect(animation).toContain('setTimeout(() => exit("failsafe"), failsafeDelay)');
  });

  it("uses a hydration-safe first-visit marker and adaptive playback", () => {
    const gate = read("src/components/splash/WorkflowSplashGate.tsx");
    const splash = read("src/components/splash/WorkflowSplash.tsx");
    const animation = read("src/hooks/useWorkflowSplashAnimation.ts");

    expect(gate).toContain('"workflow:splash-seen"');
    expect(gate).toContain('"v1"');
    expect(gate).toContain("useSyncExternalStore");
    expect(gate).toContain("window.localStorage");
    expect(gate).toContain("RETURN_VISIT_PLAYBACK_SPEED = 2.5");
    expect(gate).toContain("markSplashSeen();");
    expect(gate).toContain('reason !== "failsafe"');
    expect(gate).toContain("catch");
    expect(splash).toContain("playbackSpeed?: number");
    expect(animation).toContain("tl.timeScale(safePlaybackSpeed)");
    expect(animation).toContain("Math.max(3, safePlaybackSpeed)");
    expect(animation).toContain("Math.max(7, safePlaybackSpeed)");
    expect(animation).toContain("failsafeDelay");
    expect(animation).toContain('exit("failsafe")');
    expect(animation).toContain('skipRequested ? "skipped" : "completed"');
    expect(gate).not.toContain("suppressHydrationWarning");
    expect(splash).not.toContain("suppressHydrationWarning");
    expect(animation).not.toContain("suppressHydrationWarning");
  });

  it("preserves reduced-motion, skip, cleanup and navigation-safe lifecycle behavior", () => {
    const splash = read("src/components/splash/WorkflowSplash.tsx");
    const animation = read("src/hooks/useWorkflowSplashAnimation.ts");

    expect(splash).toContain("prefers-reduced-motion: reduce");
    expect(splash).toContain("skipAnimation");
    expect(splash).toContain("clearTimeout");
    expect(splash).toContain('leave("failsafe")');
    expect(animation).toContain("ctx.revert()");
    expect(animation).toContain("controllerRef.current = null");
    expect(animation).toContain("onExitRef.current");
  });
});
