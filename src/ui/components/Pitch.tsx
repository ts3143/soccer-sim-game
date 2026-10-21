import type { ReactNode } from "react";

/** Shared schematic pitch for lineups and player position maps. Attack is upwards. */
export function Pitch({
  children,
  label,
  compact = false,
  testId,
}: {
  children: ReactNode;
  label: string;
  compact?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`football-pitch ${compact ? "football-pitch-compact" : ""}`}
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      <svg
        className="pitch-markings"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeWidth=".35">
          <rect x="3" y="3" width="94" height="94" />
          <path d="M3 50H97 M25 3V19H75V3 M38 3V9H62V3 M25 97V81H75V97 M38 97V91H62V97 M44 3V1H56V3 M44 97V99H56V97" />
          <circle cx="50" cy="50" r="10" />
          <circle cx="50" cy="50" r=".5" fill="currentColor" />
          <path d="M39 19Q50 29 61 19 M39 81Q50 71 61 81" />
        </g>
      </svg>
      {children}
    </div>
  );
}
