/** League History (SPEC §10.5): champions, promotions, relegations, awards and cups by season. */
import type { TeamRef } from "../../common/api";
import { PlayerLink, TeamLink } from "../components/links";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const teams = (list: TeamRef[]) =>
  list.length === 0 ? (
    <span className="text-body-secondary">—</span>
  ) : (
    list.map((t, i) => (
      <span key={t.cid}>
        {i > 0 && ", "}
        <TeamLink team={t} />
      </span>
    ))
  );

/** A season's leading scorer or provider, with his tally. */
function Leader({
  leader,
  count,
}: {
  leader: { pid: number | null; name: string } | null;
  count: number | null;
}) {
  if (!leader) return <>—</>;
  return (
    <>
      {leader.pid !== null ? <PlayerLink pid={leader.pid} name={leader.name} /> : leader.name}
      {count !== null && <span className="text-body-secondary"> ({count})</span>}
    </>
  );
}

export function History() {
  const { shell } = useShell();
  const { data: view, error } = useView("history", () => toWorker("getHistory", shell.lid));
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  return (
    <>
      <PageHeader title="History" />
      {view.seasons.length === 0 ? (
        <p className="text-body-secondary">The history starts when your first season ends.</p>
      ) : (
        view.seasons.map((s) => (
          <section key={s.season} className="card mb-3" data-testid="history-season">
            <div className="card-body">
              <h2 className="h5">{seasonLabel(s.season)}</h2>
              <div className="table-responsive">
                <table className="table table-sm small align-middle mb-2">
                  <thead>
                    <tr>
                      <th>League</th>
                      <th>Champions</th>
                      <th>Promoted</th>
                      <th>Relegated</th>
                      <th>Player of the Year</th>
                      <th>Golden Boot</th>
                      <th>Top assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.leagues.map((l) => (
                      <tr key={l.id}>
                        <td className="text-nowrap">{l.name}</td>
                        <td>
                          <span className="fw-semibold">
                            {l.champion ? <TeamLink team={l.champion} /> : "—"}
                          </span>
                          {l.tableWinner && (
                            <span className="text-body-secondary" data-testid="table-winner">
                              {" "}
                              (top of the table: {l.tableWinner.name})
                            </span>
                          )}
                        </td>
                        <td>
                          {teams(l.promoted)}
                          {l.playoffWinner && (
                            <span className="text-body-secondary">
                              {" "}
                              (play-offs: {l.playoffWinner.name})
                            </span>
                          )}
                        </td>
                        <td>{teams(l.relegated)}</td>
                        <td>
                          {l.playerOfTheYear ? (
                            l.playerOfTheYear.pid !== null ? (
                              <PlayerLink
                                pid={l.playerOfTheYear.pid}
                                name={l.playerOfTheYear.name}
                              />
                            ) : (
                              l.playerOfTheYear.name
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <Leader leader={l.goldenBoot} count={l.goldenBoot?.goals ?? null} />
                        </td>
                        <td data-testid="top-assists">
                          <Leader leader={l.topAssists} count={l.topAssists?.assists ?? null} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="small">
                {s.cups.map((c) => (
                  <span key={c.id} className="me-4">
                    {c.name}: {c.winner ? <TeamLink team={c.winner} /> : "—"}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ))
      )}
    </>
  );
}
