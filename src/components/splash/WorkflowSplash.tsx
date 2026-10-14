"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import "@/styles/workflow-splash.css";
import { useWorkflowSplashAnimation } from "@/hooks/useWorkflowSplashAnimation";
import { WorkflowMark } from "./WorkflowMark";
import { ModuleDefs, WorkflowModules } from "./WorkflowModules";
import { PathDefs, WorkflowPathsBack, WorkflowPathsFront } from "./WorkflowPaths";
import {
  WordmarkDefs,
  WorkflowTagline,
  WorkflowWordmark,
} from "./WorkflowWordmark";
import { getSplashLayout, type SplashLayout } from "./splash-layout";

type SplashExitReason = "completed" | "skipped" | "failsafe";

export interface WorkflowSplashProps {
  /** Render the splash. When `false` nothing is rendered. Default `true`. */
  show?: boolean;
  /** Called once, after the splash has fully left the screen. */
  onComplete?: (reason?: SplashExitReason) => void;
  /**
   * Minimum time (ms) the splash stays up before it may accelerate when the
   * app reports `ready`. Default 2400.
   */
  minimumDuration?: number;
  /** Hard ceiling (ms): the splash always leaves by then. Default 12000. */
  maxDuration?: number;
  /** Playback speed for the existing timeline. Defaults to 1x. */
  playbackSpeed?: number;
  /** Skip the sequence: show the finished lockup with a brief fade. */
  skipAnimation?: boolean;
  /**
   * App-initialisation signal. Omit it to play the whole sequence. Pass
   * `false` while loading to hold the final lockup, then `true` to leave.
   * If `true` arrives early the remaining animation accelerates.
   */
  ready?: boolean;
  className?: string;
}

const noopSubscribe = () => () => {};

function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const PORTRAIT = "(max-aspect-ratio: 1/1)";

/** How long the static lockup is held (ms) before fading out. */
const STATIC_HOLD = 1100;
const STATIC_HOLD_SKIPPED = 600;
const STATIC_FADE = 320;

function LockupGlow({ layout }: { layout: SplashLayout }) {
  const halfW = (1589 * layout.kL) / 2;
  const y = layout.tag.y + layout.tag.fontSize * 1.3;
  return (
    <ellipse
      className="wf-lockup-glow"
      cx={0}
      cy={y}
      rx={halfW * 1.08}
      ry={layout.mode === "landscape" ? 30 : 22}
      fill="url(#wf-glow-under)"
      opacity={0}
    />
  );
}

interface StageProps {
  rootRef: RefObject<HTMLDivElement | null>;
  layout: SplashLayout;
  ready?: boolean;
  minimumDuration: number;
  maxDuration: number;
  playbackSpeed?: number;
  onExit: (reason?: SplashExitReason) => void;
}

/** The full six-stage animation. */
const AnimatedStage = memo(function AnimatedStage({
  rootRef,
  layout,
  ready,
  minimumDuration,
  maxDuration,
  playbackSpeed,
  onExit,
}: StageProps) {
  const { skip } = useWorkflowSplashAnimation({
    root: rootRef,
    layout,
    ready,
    minimumDuration,
    maxDuration,
    playbackSpeed,
    onExit,
  });

  // A tap, click or Escape hurries the sequence along.
  useEffect(() => {
    const el = rootRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    el?.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
    };
  }, [rootRef, skip]);

  return (
    <svg
      className="wf-stage"
      viewBox={`0 0 ${layout.vbW} ${layout.vbH}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
    >
      <PathDefs layout={layout} />
      <ModuleDefs />
      <WordmarkDefs layout={layout} />
      <g transform={`translate(${layout.vbW / 2} ${layout.vbH / 2})`}>
        <WorkflowPathsBack layout={layout} />
        <WorkflowMark />
        <WorkflowPathsFront layout={layout} />
        <WorkflowModules layout={layout} />
        <LockupGlow layout={layout} />
        <WorkflowWordmark layout={layout} />
        <WorkflowTagline layout={layout} />
      </g>
    </svg>
  );
});

/**
 * Reduced-motion / skipAnimation: the finished lockup, fading in briefly,
 * held, then fading out. No movement.
 */
const StaticStage = memo(function StaticStage({
  rootRef,
  layout,
  ready,
  hold,
  maxDuration,
  onExit,
}: Omit<StageProps, "minimumDuration"> & { hold: number }) {
  const readyRef = useRef(ready);
  const tryLeaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    readyRef.current = ready;
    tryLeaveRef.current();
  }, [ready]);

  useEffect(() => {
    const el = rootRef.current;
    const timers: number[] = [];
    let held = false;
    let leaving = false;

    const leave = (reason: SplashExitReason = "completed") => {
      if (leaving) return;
      leaving = true;
      if (el) el.style.pointerEvents = "none";
      el?.classList.add("wf-splash--leaving");
      timers.push(window.setTimeout(() => onExit(reason), STATIC_FADE));
    };
    tryLeaveRef.current = () => {
      if (held && readyRef.current !== false) leave();
    };

    timers.push(
      window.setTimeout(() => {
        held = true;
        tryLeaveRef.current();
      }, hold),
    );
    timers.push(window.setTimeout(() => leave("failsafe"), maxDuration));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      tryLeaveRef.current = () => {};
      el?.classList.remove("wf-splash--leaving");
    };
  }, [rootRef, hold, maxDuration, onExit]);

  return (
    <svg
      className="wf-stage wf-stage--static"
      viewBox={`0 0 ${layout.vbW} ${layout.vbH}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
    >
      <PathDefs layout={layout} />
      <g transform={`translate(${layout.vbW / 2} ${layout.vbH / 2})`}>
        <LockupGlow layout={layout} />
        <g
          transform={`translate(${layout.mark.x} ${layout.mark.y}) scale(${layout.mark.scale})`}
        >
          <WorkflowMark />
        </g>
        <WorkflowWordmark layout={layout} animated={false} />
        <WorkflowTagline layout={layout} animated={false} />
      </g>
    </svg>
  );
});

/** Chooses the variant once, on the client, so a resize never restarts it. */
function SplashStage({
  rootRef,
  skipAnimation,
  ready,
  minimumDuration,
  maxDuration,
  playbackSpeed,
  onExit,
}: Omit<StageProps, "layout"> & { skipAnimation: boolean }) {
  const [reduced] = useState(() => window.matchMedia(REDUCED_MOTION).matches);
  const [layout] = useState(() =>
    getSplashLayout(window.matchMedia(PORTRAIT).matches ? "portrait" : "landscape"),
  );

  if (reduced || skipAnimation) {
    return (
      <StaticStage
        rootRef={rootRef}
        layout={layout}
        ready={ready}
        hold={reduced ? STATIC_HOLD : Math.min(STATIC_HOLD_SKIPPED, minimumDuration)}
        maxDuration={maxDuration}
        onExit={onExit}
      />
    );
  }
  return (
    <AnimatedStage
      rootRef={rootRef}
      layout={layout}
      ready={ready}
      minimumDuration={minimumDuration}
      maxDuration={maxDuration}
        playbackSpeed={playbackSpeed}
      onExit={onExit}
    />
  );
}

/**
 * Premium Workflow brand splash.
 *
 * Mount once near the root of the app. The server (and the hydration pass)
 * render only a plain navy cover, so the app never flashes before the splash;
 * the stage mounts on the client right after hydration. It is decorative
 * (`aria-hidden`), never loops, always leaves by `maxDuration`, and is fixed
 * to the viewport so removing it causes no layout shift.
 */
export function WorkflowSplash({
  show = true,
  onComplete,
  minimumDuration = 2400,
  maxDuration = 12000,
  playbackSpeed = 1,
  skipAnimation = false,
  ready,
  className = "",
}: WorkflowSplashProps) {
  const isClient = useIsClient();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The stage must not mount until the root element is attached: when the whole
  // splash mounts in one client commit, child layout effects would otherwise run
  // before this ref is set and the animation hook would find no element.
  const [hasRoot, setHasRoot] = useState(false);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setHasRoot(node !== null);
  }, []);
  const [done, setDone] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleExit = useCallback((reason: SplashExitReason = "completed") => {
    if (completedRef.current) return;
    completedRef.current = true;
    setDone(true);
    onCompleteRef.current?.(reason);
  }, []);

  if (!show || done) return null;

  return (
    <div
      ref={setRoot}
      className={`wf-splash ${className}`.trim()}
      aria-hidden="true"
      data-managed={isClient ? "true" : undefined}
    >
      {isClient && hasRoot ? (
        <SplashStage
          rootRef={rootRef}
          skipAnimation={skipAnimation}
          ready={ready}
          minimumDuration={minimumDuration}
          maxDuration={maxDuration}
          playbackSpeed={playbackSpeed}
          onExit={handleExit}
        />
      ) : null}
    </div>
  );
}
