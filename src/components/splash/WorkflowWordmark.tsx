import { BRAND, TAGLINE, WORD_LETTERS, WORD_TM } from "./brand-paths";
import type { SplashLayout } from "./splash-layout";

/** Mask + gradient defs used to reveal the wordmark and tagline. */
export function WordmarkDefs({ layout }: { layout: SplashLayout }) {
  const { word, tag } = layout;
  const wordSpan = word.w * 1.3;
  const tagSpan = tag.length * 1.3;
  return (
    <defs>
      {/* Soft left-to-right wipe: opaque body, feathered leading edge. */}
      <linearGradient id="wf-wipe-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.86" stopColor="#fff" />
        <stop offset="1" stopColor="#000" />
      </linearGradient>
      <mask
        id="wf-word-mask"
        maskUnits="userSpaceOnUse"
        x={-60}
        y={-60}
        width={word.w + 120}
        height={word.h + 120}
      >
        <rect
          className="wf-word-wipe"
          x={-wordSpan}
          y={-60}
          width={wordSpan}
          height={word.h + 120}
          fill="url(#wf-wipe-grad)"
        />
      </mask>
      <mask
        id="wf-tag-mask"
        maskUnits="userSpaceOnUse"
        x={tag.left - 40}
        y={tag.y - tag.fontSize * 2}
        width={tag.length + 80}
        height={tag.fontSize * 4}
      >
        <rect
          className="wf-tag-wipe"
          x={tag.left - tagSpan}
          y={tag.y - tag.fontSize * 2}
          width={tagSpan}
          height={tag.fontSize * 4}
          fill="url(#wf-wipe-grad)"
        />
      </mask>
      <linearGradient id="wf-streak-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0" />
        <stop offset="0.45" stopColor={BRAND.cyan} stopOpacity="1" />
        <stop offset="0.8" stopColor={BRAND.teal} stopOpacity="1" />
        <stop offset="1" stopColor={BRAND.teal} stopOpacity="0" />
      </linearGradient>
      <linearGradient id="wf-hairline-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={BRAND.cyan} stopOpacity="0" />
        <stop offset="0.5" stopColor={BRAND.cyan} stopOpacity="1" />
        <stop offset="1" stopColor={BRAND.teal} stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** "Workflow" + trademark, in the final lockup position. */
export function WorkflowWordmark({
  layout,
  animated = true,
}: {
  layout: SplashLayout;
  /** `false` renders the finished wordmark with no reveal mask. */
  animated?: boolean;
}) {
  const { word } = layout;
  return (
    <g
      className="wf-wordmark"
      transform={`translate(${word.x} ${word.y}) scale(${word.scale})`}
      fill={BRAND.white}
    >
      <g className="wf-word" mask={animated ? "url(#wf-word-mask)" : undefined}>
        {WORD_LETTERS.map((d, i) => (
          <path key={i} className="wf-letter" d={d} />
        ))}
      </g>
      <g className="wf-tm">
        {WORD_TM.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

/** CONNECT • AUTOMATE • MOVE FORWARD, with the travelling light streak. */
export function WorkflowTagline({
  layout,
  animated = true,
}: {
  layout: SplashLayout;
  /** `false` renders the finished tagline: no mask, no streak, hairline at rest. */
  animated?: boolean;
}) {
  const { tag } = layout;
  const lineY = tag.y + tag.fontSize * 0.95;
  return (
    <g className="wf-tagline">
      <g mask={animated ? "url(#wf-tag-mask)" : undefined}>
        <text
          className="wf-tag"
          x={tag.x}
          y={tag.y}
          fontSize={tag.fontSize}
          textAnchor={tag.anchor}
          textLength={tag.length}
          lengthAdjust="spacing"
          fill="#9DB4D2"
        >
          {TAGLINE}
        </text>
      </g>
      {/* faint resting hairline, left behind once the streak has passed */}
      <rect
        className="wf-hairline"
        x={tag.left}
        y={lineY}
        width={tag.length}
        height={1.2}
        fill="url(#wf-hairline-grad)"
        opacity={animated ? undefined : 0.32}
      />
      {animated && (
        <>
          {/* travelling streak: soft halo + bright core */}
          <rect
            className="wf-streak-halo"
            x={tag.left}
            y={lineY - 2.4}
            width={tag.length * 0.34}
            height={6}
            rx={3}
            fill="url(#wf-streak-grad)"
          />
          <rect
            className="wf-streak-core"
            x={tag.left}
            y={lineY - 0.4}
            width={tag.length * 0.34}
            height={1.8}
            rx={0.9}
            fill="url(#wf-streak-grad)"
          />
        </>
      )}
    </g>
  );
}
