/** League Leaders (SPEC §11): the top ten in each category, by league and season. */
import { PlayerLink, TeamLink } from "../components/links";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function LeagueLeaders({ params }: { params: string[] }) {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const leagueId = params[0] ?? user?.leagueId ?? "ENG1";
  const season = params[1] ? Number(params[1]) : shell.state.season;
  const { data: view, error } = useView(`leaders/${leagueId}/${season}`, () =>
    toWorker("getLeagueLeaders", shell.lid, leagueId, season),
  );
  return (
    <>
      <PageHeader
        title="League Leaders"
        season={{ season, to: (s) => leaguePath(shell.lid, "league-leaders", leagueId, s) }}
      />
      <ul className="nav nav-pills mb-3">
        {shell.leagues.map((l) => (
          <li key={l.id} className="nav-item">
            <Link
              to={leaguePath(shell.lid, "league-leaders", l.id, season)}
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
        <div className="row g-3" data-testid="leaders">
          {view.categories.map((c) => (
            <section key={c.key} className="col-md-6 col-xl-3" data-testid={`leaders-${c.key}`}>
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h6 mb-1">{c.label}</h2>
                  {c.note && <div className="small text-body-secondary mb-1">{c.note}</div>}
                  {c.rows.length === 0 ? (
                    <p className="small text-body-secondary mb-0">No games yet.</p>
                  ) : (
                    <table className="table table-sm small mb-0">
                      <tbody>
                        {c.rows.map((r, i) => (
                          <tr
                            key={r.pid}
                            className={r.club.cid === shell.userCid ? "fw-semibold" : ""}
                          >
                            <td className="text-end text-body-secondary">{i + 1}</td>
                            <td>
                              <PlayerLink pid={r.pid} name={r.name} />
                              <div>
                                <TeamLink team={r.club} short />
                              </div>
                            </td>
                            <td className="text-end fw-semibold">{r.display}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
