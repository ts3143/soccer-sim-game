/**
 * A club's payroll against its soft cap (SPEC §17.7), in one line: payroll, cap, room (or
 * how far over), the free-agent rule over the cap, and the grace season if any.
 */
import type { CapView } from "../../common/api";
import { formatEuros } from "../format";
import { seasonLabel } from "../shell/Shell";

export function CapSummary({ cap, freeAgents = false }: { cap: CapView; freeAgents?: boolean }) {
  const over = cap.room < 0;
  return (
    <div className="d-flex flex-wrap gap-3 small" data-testid="cap-summary">
      <span>
        Payroll <strong>{formatEuros(cap.payroll)}</strong> of the{" "}
        <strong>{formatEuros(cap.cap)}</strong> cap
      </span>
      {over ? (
        <span className="text-danger">
          {formatEuros(-cap.room)} over: luxury tax {formatEuros(cap.taxIfEnded)} if the season
          ended today
        </span>
      ) : (
        <span>
          Cap room <strong>{formatEuros(cap.room)}</strong>
        </span>
      )}
      {freeAgents && over && (
        <span>
          Over the cap you can sign free agents only at the minimum wage (
          {formatEuros(cap.minimumWage)}).
        </span>
      )}
      {cap.grace && (
        <span className="text-body-secondary">
          Grace season: {cap.grace.league}'s cap through {seasonLabel(cap.grace.through)}
        </span>
      )}
    </div>
  );
}
