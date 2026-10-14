import { BRAND } from "./brand-paths";
import { linkPath, type SplashLayout } from "./splash-layout";

export const PARTICLE_COUNT = 14;

/** Gradients shared by the ribbons, links, nodes and glows. */
export function PathDefs({ layout }: { layout: SplashLayout }) {
  return (
    <defs>
      {layout.streams.map((s) => (
        <linearGradient
          key={s.id}
          id={`wf-stream-${s.id}`}
          gradientUnits="userSpaceOnUse"
          x1={s.x1}
          y1={0}
          x2={s.x2}
          y2={0}
        >
          <stop offset="0" stopColor={s.from} stopOpacity="1" />
          <stop offset="0.14" stopColor={s.from} stopOpacity="0.95" />
          <stop offset="0.55" stopColor={s.to} stopOpacity="0.6" />
          <stop offset="1" stopColor={s.to} stopOpacity="0" />
        </linearGradient>
      ))}
      <radialGradient id="wf-bloom">
        <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0.5" />
        <stop offset="0.35" stopColor={BRAND.blue} stopOpacity="0.22" />
        <stop offset="0.7" stopColor={BRAND.blue} stopOpacity="0.05" />
        <stop offset="1" stopColor={BRAND.blue} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="wf-glow-under">
        <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0.55" />
        <stop offset="0.45" stopColor={BRAND.blue} stopOpacity="0.25" />
        <stop offset="1" stopColor={BRAND.blue} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="wf-node-halo">
        <stop offset="0" stopColor="#CFF6FF" stopOpacity="0.85" />
        <stop offset="0.4" stopColor={BRAND.cyan} stopOpacity="0.35" />
        <stop offset="1" stopColor={BRAND.cyan} stopOpacity="0" />
      </radialGradient>
      <linearGradient id="wf-link-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0.85" />
        <stop offset="1" stopColor={BRAND.blue} stopOpacity="0.6" />
      </linearGradient>
    </defs>
  );
}

/** Everything that sits behind the W: bloom, ground glow, ribbons, links. */
export function WorkflowPathsBack({ layout }: { layout: SplashLayout }) {
  return (
    <g className="wf-world wf-world--back" transform={`scale(${layout.s0})`}>
      <circle className="wf-bloom" r={560} fill="url(#wf-bloom)" opacity={0} />
      <ellipse
        className="wf-glow-under"
        cx={0}
        cy={250}
        rx={430}
        ry={64}
        fill="url(#wf-glow-under)"
        opacity={0}
      />

      {layout.streams.map((s) => (
        <g key={s.id} className="wf-stream" data-stream={s.id}>
          <path
            className="wf-stream-glow"
            d={s.d}
            pathLength={1}
            fill="none"
            stroke={`url(#wf-stream-${s.id})`}
            strokeWidth={s.width * 3.4}
            strokeLinecap="round"
            strokeDasharray="1 2"
            strokeDashoffset={1}
            opacity={0.17}
          />
          <path
            className="wf-stream-core"
            d={s.d}
            pathLength={1}
            fill="none"
            stroke={`url(#wf-stream-${s.id})`}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeDasharray="1 2"
            strokeDashoffset={1}
          />
          <path
            className="wf-stream-streak"
            d={s.d}
            pathLength={1}
            fill="none"
            stroke="#E6FAFF"
            strokeWidth={Math.max(2.2, s.width * 0.3)}
            strokeLinecap="round"
            strokeDasharray="0.07 2"
            strokeDashoffset={0}
            opacity={0}
          />
        </g>
      ))}

      {layout.modules.map((m) => (
        <g key={m.id} className="wf-link" data-module={m.id}>
          <path
            d={linkPath(m)}
            pathLength={1}
            fill="none"
            stroke={BRAND.cyan}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray="1 2"
            strokeDashoffset={1}
            opacity={0.1}
          />
          <path
            d={linkPath(m)}
            pathLength={1}
            fill="none"
            stroke="url(#wf-link-grad)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeDasharray="1 2"
            strokeDashoffset={1}
          />
        </g>
      ))}
    </g>
  );
}

/** Glowing nodes and restrained particles that travel over the W. */
export function WorkflowPathsFront({ layout }: { layout: SplashLayout }) {
  return (
    <g className="wf-world wf-world--front" transform={`scale(${layout.s0})`}>
      {layout.streams.map((s) => (
        <g key={s.id} className="wf-node wf-node--stream" data-stream={s.id} opacity={0}>
          <circle r={18} fill="url(#wf-node-halo)" />
          <circle r={4.6} fill="#EAFBFF" />
        </g>
      ))}
      {layout.modules.map((m) => (
        <g key={m.id} className="wf-node wf-node--link" data-module={m.id} opacity={0}>
          <circle r={16} fill="url(#wf-node-halo)" />
          <circle r={4} fill="#EAFBFF" />
        </g>
      ))}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <circle key={i} className="wf-particle" r={2.2} fill="#BFEFFF" opacity={0} />
      ))}
    </g>
  );
}
