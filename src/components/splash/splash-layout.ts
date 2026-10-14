import { LOCKUP, MARK_H, MARK_W } from "./brand-paths";

/**
 * Layout + geometry for the Workflow splash.
 *
 * Two units are in play:
 *  - "mark units": the native size of the traced W (820 x 426). Everything
 *    that belongs to stages 1-4 (ribbons, links, cards) is authored in mark
 *    units, centred on the middle of the W, then scaled by `s0`.
 *  - "stage units": the SVG viewBox. The final lockup (stages 5-6) is authored
 *    in stage units, positioned relative to the viewBox centre.
 */

export type SplashMode = "landscape" | "portrait";

export type ModuleId = "database" | "email" | "automation" | "analytics" | "users";

export interface ModuleSpec {
  id: ModuleId;
  /** Final card centre, in mark units. */
  x: number;
  y: number;
  /** Point on the W (hidden under the mark) the connection line leaves from. */
  ax: number;
  ay: number;
}

export interface StreamSpec {
  id: string;
  side: "left" | "right";
  d: string;
  width: number;
  from: string;
  to: string;
  /** Gradient axis, in mark units. */
  x1: number;
  x2: number;
}

export interface SplashLayout {
  mode: SplashMode;
  vbW: number;
  vbH: number;
  /** Stage units per mark unit while the W sits centred (stages 1-4). */
  s0: number;
  /** Stage units per lockup unit in the final lockup. */
  kL: number;
  /** How far ribbons reach from the centre, in mark units. */
  reach: number;
  /** Module card edge length, in mark units. */
  card: number;
  modules: ModuleSpec[];
  streams: StreamSpec[];
  /** Final resting transform of the W, in stage units (relative to centre). */
  mark: { x: number; y: number; scale: number };
  /** Wordmark origin and scale, in stage units (relative to centre). */
  word: { x: number; y: number; scale: number; w: number; h: number };
  tag: {
    x: number;
    y: number;
    fontSize: number;
    length: number;
    anchor: "start" | "middle";
    /** Left edge of the tagline's visual extent. */
    left: number;
  };
}

const LOCKUP_CENTER_X = LOCKUP.w / 2;
const MARK_CENTER_Y = (MARK_H * LOCKUP.markScale) / 2;

/** Authored for a 1500-unit reach; x is scaled outward from each start point. */
const LEFT_STREAMS = [
  { id: "l1", start: -330, y: -168, width: 13, from: "#1769FF", to: "#17C8F5",
    d: "C -520 -235 -640 -95 -840 -160 S -1200 -300 -1500 -190" },
  { id: "l2", start: -300, y: -140, width: 8, from: "#17C8F5", to: "#23E2C3",
    d: "C -500 -60 -660 -230 -860 -140 S -1180 -20 -1500 -110" },
  { id: "l3", start: -320, y: -195, width: 4.5, from: "#4F9CFF", to: "#17C8F5",
    d: "C -540 -290 -700 -150 -900 -230 S -1220 -330 -1500 -300" },
] as const;

const RIGHT_STREAMS = [
  { id: "r1", start: 300, y: -160, width: 12, from: "#23E2C3", to: "#17C8F5",
    d: "C 500 -240 640 -90 840 -170 S 1200 -310 1500 -200" },
  { id: "r2", start: 130, y: -20, width: 9, from: "#17C8F5", to: "#1769FF",
    d: "C 330 50 520 -170 740 -60 S 1160 60 1500 -40" },
  { id: "r3", start: 150, y: 40, width: 4.5, from: "#1769FF", to: "#17C8F5",
    d: "C 350 120 540 -80 760 20 S 1180 150 1500 80" },
] as const;

/** Rescale the x coordinates of an authored path so it ends at `reach`. */
function scalePath(start: number, y: number, d: string, reach: number): string {
  const k = (reach - Math.abs(start)) / (1500 - Math.abs(start));
  let isX = true;
  const scaled = d.replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const v = Number(n);
    const out = isX ? start + (v - start) * k : v;
    isX = !isX;
    return String(Math.round(out * 10) / 10);
  });
  return `M ${start} ${y} ${scaled}`;
}

function buildStreams(reach: number): StreamSpec[] {
  const make = (
    s: (typeof LEFT_STREAMS)[number] | (typeof RIGHT_STREAMS)[number],
    side: "left" | "right",
  ): StreamSpec => ({
    id: s.id,
    side,
    d: scalePath(s.start, s.y, s.d, reach),
    width: s.width,
    from: s.from,
    to: s.to,
    x1: s.start,
    x2: side === "left" ? -reach : reach,
  });
  return [
    ...LEFT_STREAMS.map((s) => make(s, "left")),
    ...RIGHT_STREAMS.map((s) => make(s, "right")),
  ];
}

export function getSplashLayout(mode: SplashMode): SplashLayout {
  const landscape = mode === "landscape";

  const vbW = landscape ? 1600 : 800;
  const vbH = landscape ? 900 : 1000;
  const s0 = landscape ? 0.5 : 0.45;
  const kL = landscape ? 0.62 : 0.45;
  const reach = landscape ? 1500 : 880;
  const card = landscape ? 170 : 250;

  const modules: ModuleSpec[] = landscape
    ? [
        { id: "database", x: -650, y: -170, ax: -250, ay: -90 },
        { id: "email", x: -560, y: 190, ax: -240, ay: 60 },
        { id: "automation", x: 640, y: -210, ax: 250, ay: -120 },
        { id: "analytics", x: 760, y: 10, ax: 270, ay: 10 },
        { id: "users", x: 580, y: 215, ax: 240, ay: 100 },
      ]
    : [
        { id: "database", x: -480, y: -380, ax: -250, ay: -90 },
        { id: "email", x: -440, y: 400, ax: -240, ay: 60 },
        { id: "automation", x: 470, y: -400, ax: 250, ay: -120 },
        { id: "analytics", x: 610, y: 15, ax: 270, ay: 10 },
        { id: "users", x: 420, y: 420, ax: 240, ay: 100 },
      ];

  // Final lockup, centred on the viewBox. The W stays on the vertical centre.
  const markFinalScale = LOCKUP.markScale * kL;
  const mark = {
    x: (MARK_W * LOCKUP.markScale * kL) / 2 - LOCKUP_CENTER_X * kL,
    y: 0,
    scale: markFinalScale,
  };
  const word = {
    x: (LOCKUP.wordX - LOCKUP_CENTER_X) * kL,
    y: (LOCKUP.wordY - MARK_CENTER_Y) * kL,
    scale: kL,
    w: 1049,
    h: 180,
  };

  const tag = landscape
    ? {
        x: (LOCKUP.tagX - LOCKUP_CENTER_X) * kL,
        y: (LOCKUP.tagBaseline - MARK_CENTER_Y) * kL,
        fontSize: LOCKUP.tagSize * kL,
        length: LOCKUP.tagLength * kL,
        anchor: "start" as const,
        left: (LOCKUP.tagX - LOCKUP_CENTER_X) * kL,
      }
    : {
        // On narrow screens the tagline spans the lockup so it stays legible.
        x: 0,
        y: (LOCKUP.tagBaseline - MARK_CENTER_Y) * kL + 30,
        fontSize: 21,
        length: 620,
        anchor: "middle" as const,
        left: -310,
      };

  return {
    mode,
    vbW,
    vbH,
    s0,
    kL,
    reach,
    card,
    modules,
    streams: buildStreams(reach),
    mark,
    word,
    tag,
  };
}

/** Cubic connection path from the W out to a module card (mark units). */
export function linkPath(m: ModuleSpec): string {
  const dx = m.x - m.ax;
  return `M ${m.ax} ${m.ay} C ${m.ax + dx * 0.55} ${m.ay}, ${m.ax + dx * 0.45} ${m.y}, ${m.x} ${m.y}`;
}

/** Stage-by-stage timing, in seconds. Total ~5.15s plus a 0.35s exit fade. */
export const TIMING = {
  powerOn: { at: 0, dur: 0.72 },
  ribbons: { at: 0.55, dur: 0.9 },
  modules: { at: 1.3, dur: 0.75 },
  showcase: 0.25,
  return: { at: 2.3, dur: 0.5 },
  wordmark: { at: 2.65, dur: 0.7 },
  tagline: { at: 3.3, dur: 0.75 },
  streak: { at: 3.6, dur: 0.65 },
  end: 5.15,
  exit: 0.35,
} as const;
