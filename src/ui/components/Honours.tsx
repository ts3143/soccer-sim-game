/**
 * A player's honours (T, 2026-10-25): his awards and his clubs' titles, cups and
 * promotions, as a profile card and as badges on his Career rows (ZenGM-style).
 */
import type { HonourType, PlayerView } from "../../common/api";
import { seasonLabel } from "../shell/Shell";

type Honour = PlayerView["honours"][number];

export const HONOUR_LABELS: Record<HonourType, string> = {
  champions: "Champion",
  cupWinner: "Cup winner",
  promoted: "Promoted",
  playerOfTheYear: "Player of the Year",
  goldenBoot: "Golden Boot",
  topAssists: "Top assists",
  teamOfTheSeason: "Team of the Season",
};
const ORDER = Object.keys(HONOUR_LABELS) as HonourType[];
const CLUB_HONOURS: readonly HonourType[] = ["champions", "cupWinner", "promoted"];

const where = (h: Honour) => `${h.competitionName} ${seasonLabel(h.season)}`;

export function HonourBadge({ honour }: { honour: Honour }) {
  const label = HONOUR_LABELS[honour.type];
  return (
    <span
      className={`badge ${CLUB_HONOURS.includes(honour.type) ? "text-bg-warning" : "text-bg-primary"}`}
      title={`${label}: ${where(honour)}`}
      data-testid="honour-badge"
    >
      {label}
    </span>
  );
}

/** Each kind of honour once, with how many and where. */
export function HonoursCard({ honours }: { honours: readonly Honour[] }) {
  const kinds = ORDER.map((type) => honours.filter((h) => h.type === type)).filter(
    (list) => list.length > 0,
  );
  return (
    <section className="card mb-3" data-testid="player-honours">
      <div className="card-body small">
        <h2 className="h6">Honours</h2>
        {kinds.length === 0 ? (
          <p className="text-body-secondary mb-0">No honours yet.</p>
        ) : (
          <ul className="list-unstyled mb-0">
            {kinds.map((list) => (
              <li key={list[0]?.type} className="mb-1" data-testid="honour">
                <span className="fw-semibold">{list.length}×</span>{" "}
                {list[0] && <HonourBadge honour={list[0]} />}{" "}
                <span className="text-body-secondary">{list.map(where).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
