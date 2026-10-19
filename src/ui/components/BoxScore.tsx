/**
 * A match's box score (Match lab and the game's Box score page): team stats, key events and
 * both teams' players. `renderName` lets the game link player names to their profiles.
 */
import type { ReactNode } from "react";
import type { MatchResult, PlayerMatchStats } from "../../common/match";
import { crestUrl } from "../crests";
import { minuteLabel } from "./matchText";

interface Side {
  name: string;
  code: string;
  abbr: string;
  /** Shown when known (the Match lab); saved match records don't keep it. */
  formation?: string;
}

interface Props {
  home: Side;
  away: Side;
  players: Record<number, { name: string; shirtNumber: number | null }>;
  result: MatchResult;
  renderName?: (pid: number, name: string) => ReactNode;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function BoxScore({ home, away, players, result, renderName }: Props) {
  const name = (pid: number | null) => (pid === null ? "" : (players[pid]?.name ?? `#${pid}`));
  const [h, a] = result.teams;
  const rows: [string, string, string][] = [
    ["Possession", pct(h.possession), pct(a.possession)],
    ["Shots (on target)", `${h.shots} (${h.shotsOnTarget})`, `${a.shots} (${a.shotsOnTarget})`],
    ["xG", h.xg.toFixed(2), a.xg.toFixed(2)],
    ["Corners", `${h.corners}`, `${a.corners}`],
    ["Fouls", `${h.fouls}`, `${a.fouls}`],
    ["Yellow / red cards", `${h.yellowCards} / ${h.redCards}`, `${a.yellowCards} / ${a.redCards}`],
    [
      "Passes (completed)",
      `${h.passes} (${pct(h.passesCompleted / Math.max(1, h.passes))})`,
      `${a.passes} (${pct(a.passesCompleted / Math.max(1, a.passes))})`,
    ],
    [
      "Substitutions (windows)",
      `${h.subsUsed} (${h.windowsUsed})`,
      `${a.subsUsed} (${a.windowsUsed})`,
    ],
  ];
  const key = [...result.keyEvents].sort(
    (x, y) => ("clock" in x ? x.clock : 0) - ("clock" in y ? y.clock : 0),
  );

  return (
    <div>
      <div className="d-flex align-items-center justify-content-center gap-3 my-2">
        <img src={crestUrl(home.code)} alt="" width={36} height={42} />
        <div className="text-center">
          <div className="h3 mb-0">
            {home.name} {result.homeGoals}–{result.awayGoals} {away.name}
          </div>
          <div className="small text-body-secondary">
            {result.extraTime ? "after extra time" : "full time"}
            {result.penalties ? ` · ${result.penalties} on penalties` : ""}
            {home.formation && away.formation ? ` · ${home.formation} vs ${away.formation}` : ""}
          </div>
        </div>
        <img src={crestUrl(away.code)} alt="" width={36} height={42} />
      </div>

      <div className="row g-3">
        <div className="col-lg-5">
          <table className="table table-sm mb-3">
            <thead>
              <tr>
                <th />
                <th className="text-end">{home.abbr}</th>
                <th className="text-end">{away.abbr}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, hv, av]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="text-end">{hv}</td>
                  <td className="text-end">{av}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="col-lg-7">
          <h4 className="h6 text-uppercase text-body-secondary">Key events</h4>
          <ul className="list-unstyled small mb-3">
            {key.length === 0 && <li className="text-body-secondary">None</li>}
            {key.map((e, i) => {
              if (!("clock" in e)) return null;
              const team =
                e.type !== "kickoff" && e.type !== "periodEnd"
                  ? e.side === 0
                    ? home.abbr
                    : away.abbr
                  : "";
              let text: string;
              if (e.type === "goal")
                text = `⚽ ${name(e.pid)}${e.penalty ? " (pen)" : e.assistPid ? `, assist ${name(e.assistPid)}` : ""}`;
              else if (e.type === "card")
                text = `${e.card === "yellow" ? "🟨" : "🟥"} ${name(e.pid)}`;
              else if (e.type === "sub")
                text = `↔ ${name(e.inPid)} for ${name(e.outPid)}${e.reason === "injury" ? " (injury)" : ""}`;
              else if (e.type === "injury")
                text = `✚ ${name(e.pid)} injured, ~${e.days} days${e.replaced ? "" : " (not replaced)"}`;
              else return null;
              return (
                <li key={i}>
                  <span className="font-monospace text-body-secondary me-2">
                    {minuteLabel(e.clock)}
                  </span>
                  <span className="badge text-bg-light border me-2">{team}</span>
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {([0, 1] as const).map((side) => (
        <PlayerTable
          key={side}
          title={side === 0 ? home.name : away.name}
          rows={result.players.filter((p) => p.side === side)}
          players={players}
          renderName={renderName}
        />
      ))}
    </div>
  );
}

function PlayerTable({
  title,
  rows,
  players,
  renderName,
}: {
  title: string;
  rows: PlayerMatchStats[];
  players: Props["players"];
  renderName?: Props["renderName"];
}) {
  const ordered = [...rows].sort(
    (a, b) => (a.startedInSlot ?? 99) - (b.startedInSlot ?? 99) || b.minutes - a.minutes,
  );
  return (
    <div className="table-responsive mb-3">
      <table className="table table-sm table-hover small align-middle mb-0">
        <thead>
          <tr>
            <th colSpan={4}>{title}</th>
            <th className="text-end">G</th>
            <th className="text-end">A</th>
            <th className="text-end">Sh</th>
            <th className="text-end">SoT</th>
            <th className="text-end">xG</th>
            <th className="text-end">KP</th>
            <th className="text-end">Passes</th>
            <th className="text-end">Tkl</th>
            <th className="text-end">Int</th>
            <th className="text-end">Saves</th>
            <th className="text-end">Rating</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => (
            <tr key={p.pid}>
              <td className="text-end text-body-secondary">{players[p.pid]?.shirtNumber ?? ""}</td>
              <td>
                {renderName
                  ? renderName(p.pid, players[p.pid]?.name ?? `#${p.pid}`)
                  : (players[p.pid]?.name ?? p.pid)}
                {p.yellowCards > 0 && " 🟨"}
                {p.redCards > 0 && " 🟥"}
                {p.injuryDays > 0 && " ✚"}
              </td>
              <td>{p.position}</td>
              <td className="text-body-secondary">{p.minutes}&apos;</td>
              <td className="text-end">{p.goals || ""}</td>
              <td className="text-end">{p.assists || ""}</td>
              <td className="text-end">{p.shots || ""}</td>
              <td className="text-end">{p.shotsOnTarget || ""}</td>
              <td className="text-end">{p.xg > 0 ? p.xg.toFixed(2) : ""}</td>
              <td className="text-end">{p.keyPasses || ""}</td>
              <td className="text-end">
                {p.passesCompleted}/{p.passes}
              </td>
              <td className="text-end">{p.tackles || ""}</td>
              <td className="text-end">{p.interceptions || ""}</td>
              <td className="text-end">{p.position === "GK" ? p.saves : ""}</td>
              <td className="text-end fw-semibold">{p.rating.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
