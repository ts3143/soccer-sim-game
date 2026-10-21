import { StatusBadge } from "./StatusBadge";
import { injuryTitle } from "./PlayerDetails";

export function InjuryTag({
  injury,
  today,
  className = "ms-1",
  label = "I",
}: {
  injury: { type: string; until: string };
  today: string;
  className?: string;
  label?: string;
}) {
  const description = injuryTitle(injury, today);
  return (
    <StatusBadge
      label={label}
      description={description}
      tone="danger"
      className={className}
      testId="injury-tag"
      ariaLabel={`Injured: ${description}`}
    />
  );
}
