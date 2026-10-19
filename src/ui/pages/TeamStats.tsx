/** Team Stats (SPEC §11): each club's league season, from the saved match records. */
import type { TeamStatsView } from "../../common/api";
import { DataTable, type Column } from "../components/DataTable";
import { TeamLink } from "../components/links";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

type Row = TeamStatsView["rows"][number];
const num = (
  key: string,
  label: string,
  title: string,
  get: (r: Row) => number | null,
  suffix = "",
): Column<Row> => ({
  key,
  label,
  title,
  value: get,
  render: (r) => {
    const v = get(r);
    return v === null ? "" : `${v}${suffix}`;
  },
  align: "end",
});

export function TeamStats({ params }: { params: string[] }) {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const leagueId = params[0] ?? user?.leagueId ?? "ENG1";
  const season = params[1] ? Number(params[1]) : shell.state.season;
  const { data: view, error } = useView(`team-stats/${leagueId}/${season}`, () =>
    toWorker("getTeamStats", shell.lid, leagueId, season),
  );
  return (
    <>
      <PageHeader
        title="Team Stats"
        season={{ season, to: (s) => leaguePath(shell.lid, "team-stats", leagueId, s) }}
      />
      <ul className="nav nav-pills mb-3">
        {shell.leagues.map((l) => (
          <li key={l.id} className="nav-item">
            <Link
              to={leaguePath(shell.lid, "team-stats", l.id, season)}
              className={`nav-link ${l.id === leagueId ? "active" : ""}`}
            >
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          {!view.detailed && view.rows.length > 0 && (
            <p className="small text-body-secondary">
              Detailed match stats are kept for two seasons; goals and clean sheets only.
            </p>
          )}
          <DataTable
            testId="team-stats"
            rows={view.rows}
            rowKey={(r) => r.team.cid}
            pageSize={0}
            empty="No league games played yet."
            initialSort={{ key: "gf", desc: true }}
            rowClass={(r) => (r.team.cid === shell.userCid ? "fw-semibold" : "")}
            columns={[
              {
                key: "club",
                label: "Club",
                value: (r) => r.team.name,
                render: (r) => <TeamLink team={r.team} />,
              },
              num("p", "P", "Played", (r) => r.played),
              num("gf", "GF", "Goals for", (r) => r.goalsFor),
              num("ga", "GA", "Goals against", (r) => r.goalsAgainst),
              num("xg", "xG", "Expected goals for", (r) => r.xgFor),
              num("xga", "xGA", "Expected goals against", (r) => r.xgAgainst),
              num("sh", "Sh", "Shots", (r) => r.shotsFor),
              num("sha", "ShA", "Shots against", (r) => r.shotsAgainst),
              num("poss", "Poss", "Average possession", (r) => r.possession, "%"),
              num("pass", "Pass%", "Passes completed", (r) => r.passAccuracy, "%"),
              num("cor", "Cor", "Corners", (r) => r.corners),
              num("fls", "Fls", "Fouls", (r) => r.fouls),
              num("yc", "YC", "Yellow cards", (r) => r.yellowCards),
              num("rc", "RC", "Red cards", (r) => r.redCards),
              num("cs", "CS", "Clean sheets", (r) => r.cleanSheets),
            ]}
          />
        </>
      )}
    </>
  );
}
