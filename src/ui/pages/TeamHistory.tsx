/** Team History (SPEC §11): a club's seasons, finishes, top scorers and honours. */
import { PlayerLink } from "../components/links";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";
import { ordinal } from "../format";

export function TeamHistory({ params }: { params: string[] }) {
  const { shell } = useShell();
  const cid = params[0] !== undefined ? Number(params[0]) : shell.userCid;
  const { data: view, error } = useView(`team-history/${cid}`, () =>
    toWorker("getTeamHistory", shell.lid, cid),
  );
  return (
    <>
      <PageHeader title="History" team={{ cid, page: "team-history" }} />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3" data-testid="honours">
            {view.honours.length === 0 ? (
              <span className="small text-body-secondary">No honours yet.</span>
            ) : (
              view.honours.map((h) => (
                <span
                  key={h.label}
                  className="badge text-bg-warning"
                  title={h.seasons.map(seasonLabel).join(", ")}
                >
                  {h.label}
                  {h.seasons.length > 1
                    ? ` ×${h.seasons.length}`
                    : ` ${seasonLabel(h.seasons[0] ?? 0)}`}
                </span>
              ))
            )}
          </div>
          <div className="table-responsive">
            <table
              className="table table-sm table-hover small align-middle"
              data-testid="team-seasons"
            >
              <thead>
                <tr>
                  <th>Season</th>
                  <th>League</th>
                  <th className="text-end">Pos</th>
                  <th className="text-end">P</th>
                  <th className="text-end">W</th>
                  <th className="text-end">D</th>
                  <th className="text-end">L</th>
                  <th className="text-end">Goals</th>
                  <th className="text-end">Pts</th>
                  <th>Top scorer</th>
                  <th>Honours</th>
                </tr>
              </thead>
              <tbody>
                {view.seasons.map((s) => (
                  <tr key={s.season}>
                    <td className="text-nowrap">
                      {seasonLabel(s.season)}
                      {s.current && <span className="badge text-bg-light ms-1">now</span>}
                    </td>
                    <td className="text-nowrap">{s.leagueName}</td>
                    <td className="text-end">{s.finish ? ordinal(s.finish) : ""}</td>
                    <td className="text-end">{s.played}</td>
                    <td className="text-end">{s.won}</td>
                    <td className="text-end">{s.drawn}</td>
                    <td className="text-end">{s.lost}</td>
                    <td className="text-end text-nowrap">
                      {s.goalsFor}–{s.goalsAgainst}
                    </td>
                    <td className="text-end fw-semibold">{s.points}</td>
                    <td>
                      {s.topScorer && (
                        <>
                          <PlayerLink pid={s.topScorer.pid} name={s.topScorer.name} /> (
                          {s.topScorer.goals})
                        </>
                      )}
                    </td>
                    <td>{s.honours.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
