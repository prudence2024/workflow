import type { ReactNode } from "react";
import type { ModuleId, SplashLayout } from "./splash-layout";

const CARD_FILL: Record<ModuleId, [string, string]> = {
  database: ["#8B7BFF", "#5A3FE0"],
  email: ["#3F8DFF", "#1252E6"],
  automation: ["#33EBD1", "#0FB09B"],
  analytics: ["#2FA6FF", "#0F5FE0"],
  users: ["#8B7BFF", "#5A3FE0"],
};

/** Gear: ring + hub + eight teeth, generated so the geometry stays exact. */
function gearTeeth(): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const f = (n: number) => n.toFixed(2);
    parts.push(`M${f(c * 8.3)} ${f(s * 8.3)}L${f(c * 10.7)} ${f(s * 10.7)}`);
  }
  return parts.join("");
}
const GEAR_TEETH = gearTeeth();

const ICONS: Record<ModuleId, ReactNode> = {
  database: (
    <>
      <ellipse cx={12} cy={6} rx={7.5} ry={3} />
      <path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
    </>
  ),
  email: (
    <>
      <rect x={3} y={5} width={18} height={14} rx={2.6} />
      <path d="m3.8 7.4 8.2 5.5 8.2-5.5" />
    </>
  ),
  automation: (
    <g transform="translate(12 12)">
      <circle r={6.2} />
      <circle r={2.4} />
      <path d={GEAR_TEETH} strokeWidth={2.6} />
    </g>
  ),
  analytics: (
    <path d="M6 19v-6M12 19V6M18 19v-9" strokeWidth={2.8} />
  ),
  users: (
    <>
      <circle cx={9} cy={8.2} r={3.4} />
      <path d="M3 20c0-3.4 2.7-5.8 6-5.8s6 2.4 6 5.8" />
      <circle cx={17.4} cy={9.4} r={2.6} />
      <path d="M16.6 14.6c2.6.1 4.4 2 4.4 5" />
    </>
  ),
};

export function ModuleDefs() {
  return (
    <defs>
      {(Object.keys(CARD_FILL) as ModuleId[]).map((id) => (
        <linearGradient key={id} id={`wf-card-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={CARD_FILL[id][0]} />
          <stop offset="1" stopColor={CARD_FILL[id][1]} />
        </linearGradient>
      ))}
    </defs>
  );
}

/** Floating product-module cards. Authored in mark units like the ribbons. */
export function WorkflowModules({ layout }: { layout: SplashLayout }) {
  const c = layout.card;
  const iconScale = (c * 0.46) / 24;
  return (
    <g className="wf-world wf-world--modules" transform={`scale(${layout.s0})`}>
      {layout.modules.map((m) => (
        <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
          <g className="wf-card-float">
            <g className="wf-card" data-module={m.id} opacity={0}>
              <rect
                x={-c / 2}
                y={-c / 2 + c * 0.06}
                width={c}
                height={c}
                rx={c * 0.27}
                fill="#000"
                opacity={0.28}
              />
              <rect
                x={-c / 2}
                y={-c / 2}
                width={c}
                height={c}
                rx={c * 0.27}
                fill={`url(#wf-card-${m.id})`}
              />
              <rect
                x={-c / 2 + 1}
                y={-c / 2 + 1}
                width={c - 2}
                height={c - 2}
                rx={c * 0.27 - 1}
                fill="none"
                stroke="#fff"
                strokeOpacity={0.26}
                strokeWidth={2}
              />
              <g
                transform={`scale(${iconScale}) translate(-12 -12)`}
                fill="none"
                stroke="#fff"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICONS[m.id]}
              </g>
            </g>
          </g>
        </g>
      ))}
    </g>
  );
}
