"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { WorkflowSplash, type WorkflowSplashProps } from "./WorkflowSplash";

export const WORKFLOW_SPLASH_SEEN_KEY = "workflow:splash-seen";
const WORKFLOW_SPLASH_SEEN_VALUE = "v1";
// TIMING.end is 5.15s; 8x plus the 0.35s exit fade keeps reloads near 1s.
// The root layout owns this gate, so client-side navigation does not remount it.
const RETURN_VISIT_PLAYBACK_SPEED = 8;

type SplashVisitMode = "first" | "return";

const noopSubscribe = () => () => {};

function getClientVisitMode(): SplashVisitMode {
  try {
    return window.localStorage.getItem(WORKFLOW_SPLASH_SEEN_KEY) === WORKFLOW_SPLASH_SEEN_VALUE
      ? "return"
      : "first";
  } catch {
    return "first";
  }
}

function getServerVisitMode(): SplashVisitMode {
  return "first";
}

function useSplashVisitMode(): SplashVisitMode {
  return useSyncExternalStore(noopSubscribe, getClientVisitMode, getServerVisitMode);
}

function markSplashSeen(): void {
  try {
    window.localStorage.setItem(WORKFLOW_SPLASH_SEEN_KEY, WORKFLOW_SPLASH_SEEN_VALUE);
  } catch {
    // Storage can be disabled or unavailable; the splash must still complete.
  }
}

/**
 * Drop-in mount for the root layout. Holds the "splash complete" state so the
 * layout itself can stay a Server Component:
 *
 *   <body>
 *     <WorkflowSplashGate />
 *     {children}
 *   </body>
 *
 * Pass `ready={false}` while the app initialises and `ready` once it is done
 * if you want the splash to hold or accelerate; otherwise it plays in full.
 */
export function WorkflowSplashGate({
  onComplete,
  ...props
}: Omit<WorkflowSplashProps, "show">) {
  const [complete, setComplete] = useState(false);
  const visitMode = useSplashVisitMode();
  const handleComplete = useCallback((reason?: "completed" | "skipped" | "failsafe") => {
    if (reason !== "failsafe") markSplashSeen();
    setComplete(true);
    onComplete?.();
  }, [onComplete]);

  return (
    <WorkflowSplash
      {...props}
      show={!complete}
      playbackSpeed={visitMode === "return" ? RETURN_VISIT_PLAYBACK_SPEED : 1}
      onComplete={handleComplete}
    />
  );
}
