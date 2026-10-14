import { MARK_H, MARK_LAYERS, MARK_W } from "./brand-paths";

/**
 * The Workflow "W", drawn from the traced brand geometry (four colour layers).
 * Rendered inside the splash <svg>, centred on its own origin so scaling and
 * positioning it with transforms pivots around the middle of the W.
 */
export function WorkflowMark({ className = "" }: { className?: string }) {
  return (
    <g className={`wf-mark ${className}`.trim()}>
      <g transform={`translate(${-MARK_W / 2} ${-MARK_H / 2})`}>
        {MARK_LAYERS.map((layer) => (
          <path
            key={layer.id}
            className={`wf-mark-layer wf-mark-layer--${layer.id}`}
            fill={layer.fill}
            d={layer.d}
          />
        ))}
      </g>
    </g>
  );
}
