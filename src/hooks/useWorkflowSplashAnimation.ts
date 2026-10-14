import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { PARTICLE_COUNT } from "@/components/splash/WorkflowPaths";
import { TIMING, type SplashLayout } from "@/components/splash/splash-layout";

export interface WorkflowSplashAnimationOptions {
  /** The splash root element; every selector below is scoped to it. */
  root: RefObject<HTMLDivElement | null>;
  layout: SplashLayout;
  /**
   * App-initialisation signal. `undefined` = no signal, play the full sequence.
   * `false` = still loading, hold the final lockup. `true` = ready, accelerate
   * the remaining sequence once `minimumDuration` has elapsed.
   */
  ready?: boolean;
  /** Minimum time (ms) the splash stays up before it may accelerate. */
  minimumDuration: number;
  /** Hard ceiling (ms): the splash always leaves by then. */
  maxDuration: number;
  /** Playback speed applied to the existing timeline for this lifecycle. */
  playbackSpeed?: number;
  /** Called once, after the exit fade has finished. */
  onExit: (reason?: SplashExitReason) => void;
}

interface Controller {
  readyChanged: () => void;
  skip: () => void;
  exit: () => void;
}

type SplashExitReason = "completed" | "skipped" | "failsafe";

/** Small deterministic PRNG so particle placement is stable between runs. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function useWorkflowSplashAnimation({
  root,
  layout,
  ready,
  minimumDuration,
  maxDuration,
  playbackSpeed = 1,
  onExit,
}: WorkflowSplashAnimationOptions): { skip: () => void; exit: () => void } {
  const readyRef = useRef(ready);
  const onExitRef = useRef(onExit);
  const controllerRef = useRef<Controller | null>(null);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    readyRef.current = ready;
    controllerRef.current?.readyChanged();
  }, [ready]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;

    const started = performance.now();
    const timers: number[] = [];
    let exiting = false;
    let timelineDone = false;
    let skipRequested = false;
    let tl: gsap.core.Timeline | null = null;
    let ctx: ReturnType<typeof gsap.context>;
    const safePlaybackSpeed = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;

    const exit = (reason: SplashExitReason = "completed") => {
      if (exiting) return;
      exiting = true;
      el.style.pointerEvents = "none";
      ctx.add(() => {
        gsap.to(el, {
          opacity: 0,
          duration: TIMING.exit,
          ease: "power1.inOut",
          onComplete: () => onExitRef.current(reason),
        });
      });
    };

    const maybeExit = () => {
      if (exiting) return;
      // `false` means the app is still initialising: hold the final lockup.
      if (readyRef.current === false) return;
      exit(skipRequested ? "skipped" : "completed");
    };

    const accelerate = (scale: number, ramp: number) => {
      if (!tl || timelineDone) {
        maybeExit();
        return;
      }
      gsap.to(tl, { timeScale: scale, duration: ramp, ease: "power1.in", overwrite: true });
    };

    ctx = gsap.context(() => {
      const q = gsap.utils.selector(el);
      const all = (s: string) => q(s) as unknown as SVGElement[];
      const { s0, mark, tag, word, modules } = layout;
      const wordSpan = word.w * 1.3;
      const tagSpan = tag.length * 1.3;
      const rand = mulberry32(7);

      const streamCores = all(".wf-stream-core") as unknown as SVGGeometryElement[];
      const streamGlows = all(".wf-stream-glow");
      const streaks = all(".wf-stream-streak");
      const streamNodes = all(".wf-node--stream");
      const linkGroups = all(".wf-link");
      const linkPaths = all(".wf-link path");
      const linkNodes = all(".wf-node--link");
      const cards = all(".wf-card");
      const floats = all(".wf-card-float");
      const particles = all(".wf-particle");
      const letters = all(".wf-letter");
      const linkCores = linkGroups.map(
        (g) => g.querySelectorAll("path")[1] as unknown as SVGGeometryElement,
      );

      /* ---- initial states (applied before first paint) ---- */
      gsap.set(el, { opacity: 1 });
      gsap.set(all(".wf-mark"), { svgOrigin: "0 0", scale: s0 * 0.88, x: 0, y: 14 });
      gsap.set(all(".wf-mark-layer"), { opacity: 0 });
      gsap.set(all(".wf-bloom"), { opacity: 0, scale: 0.6 });
      gsap.set(all(".wf-glow-under"), { opacity: 0, scaleX: 0.4, transformOrigin: "50% 50%" });
      gsap.set(streaks, { opacity: 0 });
      gsap.set([...streamNodes, ...linkNodes], { opacity: 0 });
      gsap.set(cards, { svgOrigin: "0 0", opacity: 0, scale: 0.7 });
      cards.forEach((c, i) => {
        gsap.set(c, { x: -modules[i].x * 0.32, y: -modules[i].y * 0.32 });
      });
      gsap.set(all(".wf-word-wipe"), { x: 0 });
      gsap.set(all(".wf-tag-wipe"), { x: 0 });
      gsap.set(letters, { opacity: 0 });
      gsap.set(all(".wf-tm"), { opacity: 0 });
      gsap.set(all(".wf-tag"), { opacity: 0 });
      gsap.set(all(".wf-hairline"), { opacity: 0 });
      gsap.set(all(".wf-streak-halo, .wf-streak-core"), { opacity: 0, x: -tag.length * 0.34 });
      gsap.set(all(".wf-lockup-glow"), { opacity: 0, scaleX: 0.5, transformOrigin: "50% 50%" });

      // Particles ride along the ribbons, placed deterministically.
      particles.slice(0, PARTICLE_COUNT).forEach((p, i) => {
        const path = streamCores[i % streamCores.length];
        const len = path.getTotalLength();
        const pt = path.getPointAtLength(len * (0.22 + rand() * 0.62));
        gsap.set(p, { x: pt.x, y: pt.y + (rand() - 0.5) * 30 });
      });

      /** Move a node group along a path as `proxy.t` goes 0 → 1. */
      const travel = (
        node: Element,
        path: SVGGeometryElement,
        from: number,
        to: number,
        duration: number,
        position: number,
        ease: string,
      ) => {
        const len = path.getTotalLength();
        const proxy = { t: from };
        const place = () => {
          const p = path.getPointAtLength(proxy.t * len);
          node.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        };
        place();
        tl!.to(proxy, { t: to, duration, ease, onUpdate: place }, position);
        // fade in quickly, fade out over the last third
        tl!.to(node, { opacity: 1, duration: duration * 0.2, ease: "power1.out" }, position);
        tl!.to(node, { opacity: 0, duration: duration * 0.3, ease: "power1.in" }, position + duration * 0.7);
      };

      tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: () => {
          timelineDone = true;
          maybeExit();
        },
      });
      tl.timeScale(safePlaybackSpeed);

      /* ---- 1. LOGO APPEARS: powers on ---- */
      const s1 = TIMING.powerOn;
      tl.to(all(".wf-mark"), { scale: s0, y: 0, duration: s1.dur, ease: "expo.out" }, s1.at);
      tl.to(
        all(".wf-mark-layer"),
        { opacity: 1, duration: 0.42, ease: "power2.out", stagger: 0.07 },
        s1.at + 0.02,
      );
      tl.to(all(".wf-bloom"), { opacity: 1, scale: 1, duration: s1.dur, ease: "power2.out" }, s1.at);
      tl.to(all(".wf-bloom"), { opacity: 0.55, duration: 0.55, ease: "sine.inOut" }, s1.at + 0.6);
      tl.to(
        all(".wf-glow-under"),
        { opacity: 1, scaleX: 1, duration: s1.dur, ease: "power2.out" },
        s1.at + 0.05,
      );

      /* ---- 2. LOGO UNFOLDS INTO FLOWING RIBBONS ---- */
      const s2 = TIMING.ribbons;
      tl.to(
        [...streamGlows, ...(streamCores as unknown as Element[])],
        { strokeDashoffset: 0, duration: s2.dur * 0.82, ease: "power2.inOut", stagger: { amount: 0.18 } },
        s2.at,
      );
      tl.to(streaks, { opacity: 1, duration: 0.15, stagger: { amount: 0.18 } }, s2.at + 0.1);
      tl.to(
        streaks,
        {
          strokeDashoffset: -1.1,
          duration: s2.dur * 0.9,
          ease: "power1.inOut",
          stagger: { amount: 0.18 },
        },
        s2.at + 0.1,
      );
      tl.to(streaks, { opacity: 0, duration: 0.2, stagger: { amount: 0.18 } }, s2.at + s2.dur - 0.1);
      streamNodes.forEach((node, i) => {
        travel(node, streamCores[i], 0.02, 1, s2.dur * 0.95, s2.at + 0.12 + i * 0.03, "power1.inOut");
      });
      particles.forEach((p) => {
        const at = s2.at + 0.15 + rand() * 0.6;
        const dx = (rand() - 0.5) * 36;
        const dy = -10 - rand() * 18;
        tl!.to(p, { opacity: 0.75, duration: 0.25, ease: "power1.out" }, at);
        tl!.to(p, { x: `+=${dx.toFixed(1)}`, y: `+=${dy.toFixed(1)}`, duration: 0.9, ease: "none" }, at);
        tl!.to(p, { opacity: 0, duration: 0.4, ease: "power1.in" }, at + 0.45);
      });

      /* ---- 3. RIBBONS TRANSFORM INTO PRODUCT MODULES ---- */
      const s3 = TIMING.modules;
      // Dim the ribbons (glow halos are already faint) so the modules read.
      tl.to(streamGlows, { opacity: 0.07, duration: 0.5, ease: "sine.inOut" }, s3.at);
      tl.to(streamCores as unknown as Element[], { opacity: 0.38, duration: 0.5, ease: "sine.inOut" }, s3.at);
      tl.to(
        linkPaths,
        { strokeDashoffset: 0, duration: s3.dur * 0.72, ease: "power2.out", stagger: { amount: 0.16 } },
        s3.at,
      );
      linkNodes.forEach((node, i) => {
        travel(node, linkCores[i], 0.02, 1, s3.dur * 0.7, s3.at + i * 0.04, "power2.out");
      });
      tl.to(
        cards,
        {
          opacity: 1,
          scale: 1,
          x: 0,
          y: 0,
          duration: s3.dur * 0.8,
          ease: "power3.out",
          stagger: { amount: 0.16 },
        },
        s3.at + 0.14,
      );
      tl.to(
        floats,
        {
          y: (i: number) => (i % 2 ? -7 : 7),
          duration: 0.5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: 1,
          stagger: 0.05,
        },
        s3.at + s3.dur - 0.2,
      );

      /* ---- 4. MODULES RETURN INTO THE CORE ---- */
      const s4 = TIMING.return;
      cards.forEach((c, i) => {
        tl!.to(
          c,
          {
            opacity: 0,
            scale: 0.82,
            x: -modules[i].x * 0.26,
            y: -modules[i].y * 0.26,
            duration: s4.dur * 0.9,
            ease: "power2.in",
          },
          s4.at + i * 0.03,
        );
      });
      tl.to(
        linkPaths,
        { strokeDashoffset: 1, duration: s4.dur * 0.9, ease: "power2.in", stagger: { amount: 0.08 } },
        s4.at,
      );
      linkNodes.forEach((node, i) => {
        travel(node, linkCores[i], 0.95, 0.02, s4.dur * 0.85, s4.at + i * 0.02, "power2.in");
      });
      tl.to(
        [...streamGlows, ...(streamCores as unknown as Element[])],
        { strokeDashoffset: 1, duration: s4.dur, ease: "power2.inOut", stagger: { amount: 0.1 } },
        s4.at,
      );
      // the W takes the light back in
      tl.to(all(".wf-bloom"), { opacity: 0.9, duration: 0.22, ease: "power1.out" }, s4.at + 0.2);

      /* ---- 5. WORKFLOW WORDMARK FORMS ---- */
      const s5 = TIMING.wordmark;
      tl.to(
        all(".wf-mark"),
        { x: mark.x, y: mark.y, scale: mark.scale, duration: s5.dur, ease: "power3.inOut" },
        s5.at,
      );
      tl.to(all(".wf-bloom"), { opacity: 0, duration: s5.dur, ease: "power1.inOut" }, s5.at);
      tl.to(all(".wf-glow-under"), { opacity: 0, duration: s5.dur * 0.8, ease: "power1.inOut" }, s5.at);
      tl.to(
        all(".wf-word-wipe"),
        { x: wordSpan, duration: s5.dur * 0.85, ease: "power2.inOut" },
        s5.at + 0.3,
      );
      tl.fromTo(
        letters,
        { x: (i: number) => -i * 13, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.04 },
        s5.at + 0.32,
      );
      tl.to(all(".wf-tm"), { opacity: 1, duration: 0.3, ease: "power1.out" }, s5.at + s5.dur - 0.1);

      /* ---- 6. TAGLINE APPEARS ---- */
      const s6 = TIMING.tagline;
      tl.to(all(".wf-tag"), { opacity: 1, duration: 0.45, ease: "power1.out" }, s6.at);
      tl.to(all(".wf-tag-wipe"), { x: tagSpan, duration: s6.dur, ease: "power2.inOut" }, s6.at);
      tl.to(all(".wf-lockup-glow"), { opacity: 1, scaleX: 1, duration: 0.7, ease: "power2.out" }, s6.at);
      const st = TIMING.streak;
      tl.to(all(".wf-streak-halo"), { opacity: 0.55, duration: 0.12 }, st.at);
      tl.to(all(".wf-streak-core"), { opacity: 1, duration: 0.12 }, st.at);
      tl.to(
        all(".wf-streak-halo, .wf-streak-core"),
        { x: tag.length, duration: st.dur, ease: "power1.inOut" },
        st.at,
      );
      tl.to(all(".wf-streak-halo, .wf-streak-core"), { opacity: 0, duration: 0.18 }, st.at + st.dur - 0.12);
      tl.to(all(".wf-hairline"), { opacity: 0.32, duration: 0.5, ease: "sine.inOut" }, st.at + 0.25);

      // Hold the finished lockup until TIMING.end.
      tl.to({}, { duration: 0.001 }, TIMING.end - 0.001);
    }, el);

    const controller: Controller = {
      exit,
      skip: () => {
        skipRequested = true;
        accelerate(Math.max(7, safePlaybackSpeed), 0.2);
      },
      readyChanged: () => {
        if (readyRef.current === true && !exiting) {
          const wait = Math.max(0, minimumDuration - (performance.now() - started));
          timers.push(
            window.setTimeout(() => {
              if (timelineDone) maybeExit();
              else accelerate(Math.max(3, safePlaybackSpeed), 0.35);
            }, wait),
          );
        } else if (readyRef.current !== false && timelineDone) {
          maybeExit();
        }
      },
    };
    controllerRef.current = controller;

    // Never trap the user: whatever happens, leave by a speed-aware deadline.
    const scaledTimelineMs = (TIMING.end * 1000) / safePlaybackSpeed + TIMING.exit * 1000 + 1000;
    const failsafeDelay = readyRef.current === false
      ? maxDuration
      : Math.min(maxDuration, Math.max(1000, scaledTimelineMs));
    timers.push(window.setTimeout(() => exit("failsafe"), failsafeDelay));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      controllerRef.current = null;
      ctx.revert();
    };
  }, [root, layout, minimumDuration, maxDuration, playbackSpeed]);

  const skip = useCallback(() => controllerRef.current?.skip(), []);
  const exit = useCallback(() => controllerRef.current?.exit(), []);
  return { skip, exit };
}
