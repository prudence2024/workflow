export function FlowArrow({ direction = "right", className = "" }: { direction?: "right" | "up-right"; className?: string }) {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 15 15" fill="none" className={className}>
      {direction === "up-right" ? (
        <path d="M3.25 11.75 11.75 3.25M5.5 3.25h6.25V9.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M2.5 7.5h9M8 4l3.5 3.5L8 11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function FlowCheck({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 15 15" fill="none" className={className}>
      <path d="m3.25 7.75 2.5 2.5 6-6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PipelineSymbol({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="30" height="16" viewBox="0 0 30 16" fill="none" className={className}>
      <circle cx="3" cy="8" r="2" fill="currentColor" />
      <path d="M6 8h6m3 0h6m3 0h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="13.5" cy="8" r="2" fill="currentColor" />
      <circle cx="22.5" cy="8" r="2" fill="currentColor" />
      <path d="m24.75 5.75 2.25 2.25-2.25 2.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
