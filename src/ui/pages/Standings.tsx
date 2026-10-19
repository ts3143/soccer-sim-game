/** Standings (SPEC §11): each league's table with promotion, play-off and relegation zones. */
import type { StandingsRow } from "../../common/api";
import { DataTable } from "../components/DataTable";
import { FormBadges, TeamLink } from "../components/links";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";
import { ZONE_CLASS } from "../components/zones";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function Standings({ params }: { params: string[] }) {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const leagueId = params[0] ?? user?.leagueId ?? shell.leagues[0]?.id ?? "";
  const season = params[1] ? Number(params[1]) : shell.state.season;
  const { data: view, error } = useView(`standings/${leagueId}/${season}`, () =>
    toWorker("getStandings", shell.lid, leagueId, season),
  );
  const live = season === shell.state.season;
  return (
    <>
      <PageHeader
        title="Standings"
        season={{ season, to: (s) => leaguePath(shell.lid, "standings", leagueId, s) }}
      />
      <ul className="nav nav-pills mb-3">
        {shell.leagues.map((l) => (
          <li key={l.id} className="nav-item">
            <Link
              to={leaguePath(shell.lid, "standings", l.id, season)}
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
          <p className="small text-body-secondary">
            {view.leagueName}, {seasonLabel(view.season)}
            {view.current ? " (live)" : " (final table)"}
          </p>
          <DataTable<StandingsRow>
            testId="standings-table"
            rows={view.rows}
            rowKey={(r) => r.cid}
            pageSize={0}
            initialSort={{ key: "pos", desc: false }}
            rowClass={(r) =>
              `${r.zone ? ZONE_CLASS[r.zone] : ""} ${r.cid === shell.userCid ? "fw-semibold" : ""}`
            }
            columns={[
              { key: "pos", label: "#", value: (r) => r.position, align: "end", desc: false },
              {
                key: "club",
                label: "Club",
                value: (r) => r.name,
                render: (r) => <TeamLink team={r} />,
              },
              { key: "p", label: "P", title: "Played", value: (r) => r.played, align: "end" },
              { key: "w", label: "W", title: "Won", value: (r) => r.won, align: "end" },
              { key: "d", label: "D", title: "Drawn", value: (r) => r.drawn, align: "end" },
              { key: "l", label: "L", title: "Lost", value: (r) => r.lost, align: "end" },
              {
                key: "gf",
                label: "GF",
                title: "Goals for",
                value: (r) => r.goalsFor,
                align: "end",
              },
              {
                key: "ga",
                label: "GA",
                title: "Goals against",
                value: (r) => r.goalsAgainst,
                align: "end",
              },
              {
                key: "gd",
                label: "GD",
                title: "Goal difference",
                value: (r) => r.goalDifference,
                render: (r) => signed(r.goalDifference),
                align: "end",
              },
              { key: "pts", label: "Pts", title: "Points", value: (r) => r.points, align: "end" },
              ...(live
                ? [
                    {
                      key: "home",
                      label: "Home",
                      title: "Won-drawn-lost at home",
                      render: (r: StandingsRow) => r.home,
                      align: "end" as const,
                    },
                    {
                      key: "away",
                      label: "Away",
                      title: "Won-drawn-lost away",
                      render: (r: StandingsRow) => r.away,
                      align: "end" as const,
                    },
                    {
                      key: "form",
                      label: "Form",
                      title: "Last five league games",
                      render: (r: StandingsRow) => <FormBadges form={r.form ?? []} />,
                    },
                  ]
                : []),
            ]}
          />
          <div className="d-flex flex-wrap gap-3 small" data-testid="zones">
            {view.zones.map((z) => (
              <span key={z.zone}>
                <span
                  className={`d-inline-block border me-1 ${ZONE_CLASS[z.zone]}`}
                  style={{ width: 14, height: 14, verticalAlign: "middle" }}
                />
                {z.label}
              </span>
            ))}
          </div>
          {view.notes.length > 0 && (
            <ul className="small mt-3" data-testid="season-notes">
              {view.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
