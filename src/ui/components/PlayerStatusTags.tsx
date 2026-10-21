import { formatDate, formatEuros } from "../format";
import { InjuryTag } from "./InjuryTag";
import { StatusBadge } from "./StatusBadge";

type StatusPlayer = {
  injury?: { type: string; until: string } | null;
  listed?: { asking: number; date: string } | null;
  expiring?: boolean;
  expires?: string | null;
  suspension?: number;
  status?: string;
  loan?: string | null;
  academy?: boolean;
  loanee?: boolean;
};
export function PlayerStatusTags({ player: p, today }: { player: StatusPlayer; today: string }) {
  return (
    <>
      {p.injury && <InjuryTag injury={p.injury} today={today} />}
      {p.expiring && (
        <StatusBadge
          label="E"
          tone="warning"
          description={`Contract expires ${p.expires ? formatDate(p.expires) : "this June"}`}
        />
      )}
      {p.listed && (
        <StatusBadge
          label="TL"
          tone="info"
          description={`Transfer listed at ${formatEuros(p.listed.asking)} since ${formatDate(p.listed.date)}`}
        />
      )}
      {(p.suspension ?? 0) > 0 && (
        <StatusBadge
          label={`S${p.suspension}`}
          tone="danger"
          description={`Suspended: ${p.suspension} domestic match${p.suspension === 1 ? "" : "es"} remaining`}
        />
      )}
      {(p.loan || p.loanee) && (
        <StatusBadge
          label="L"
          tone="info"
          description={p.loan ? `On loan ${p.loan}` : "On loan at this club"}
        />
      )}
      {(p.academy || p.status === "academy") && (
        <StatusBadge label="A" description="Academy player" />
      )}
    </>
  );
}
