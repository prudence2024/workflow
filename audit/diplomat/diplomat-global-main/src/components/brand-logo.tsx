import logo from "@/assets/diplomat-logo.png";

export function BrandLogo({
  compact = false,
  compactOnMobile = false,
  onDark = false,
  darkBadge = false,
}: {
  compact?: boolean;
  compactOnMobile?: boolean;
  onDark?: boolean;
  /** Uses the same dark square badge as the site header (for dark footers). */
  darkBadge?: boolean;
}) {
  const badgeClass =
    darkBadge || !onDark
      ? "bg-inverse ring-inverse-foreground/10"
      : "bg-inverse-foreground ring-inverse/10";
  const titleClass = onDark || darkBadge ? "text-inverse-foreground" : "text-ink";
  const subtitleClass =
    onDark || darkBadge ? "text-inverse-foreground/60" : "text-muted-foreground";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className={`grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg p-1.5 ring-1 ${badgeClass}`}
      >
        <img src={logo} alt="" className="h-full w-full object-contain" />
      </span>
      {!compact && (
        <span
          className={`${compactOnMobile ? "hidden min-[410px]:block" : "block"} min-w-0 font-display text-[15px] font-semibold leading-[0.95] tracking-[-0.04em] ${titleClass}`}
        >
          Diplomat Global
          <span
            className={`mt-1 block text-[8px] font-semibold uppercase tracking-[0.19em] ${subtitleClass}`}
          >
            Tech-Solutions
          </span>
        </span>
      )}
    </span>
  );
}
