/**
 * Draft Picks (SPEC §17.5, §17.8): the picks a club holds for the coming draft and the two
 * after it, with their numbers once the lottery has set them (before then, this season's
 * projected from the tables), and its own picks other clubs hold.
 */
import { TeamLink } from "../components/links";
import { draftName } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function DraftPicks({ params }: { params: string[] }) {
  const { shell } = useShell();
  const cid = params[0] !== undefined ? Number(params[0]) : shell.userCid;
  const { data: view, error } = useView(`draft-picks/${cid}`, () =>
    toWorker("getDraftPicks", shell.lid, cid),
  );
  return (
    <>
      <PageHeader title="Draft Picks" team={{ cid, page: "draft-picks" }} />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="small text-body-secondary">
            Picks are owned assets: they can be traded, and a traded pick keeps the slot of the club
            it came from, lottery included. Each club holds picks for the coming draft and the two
            after it. See the <Link to={leaguePath(shell.lid, "draft")}>Draft</Link>.
          </p>
          <div className="table-responsive">
            <table className="table table-sm table-hover small w-auto" data-testid="draft-picks">
              <thead>
                <tr>
                  <th>Draft</th>
                  <th className="text-end">Round</th>
                  <th className="text-end">Pick</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {view.picks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-body-secondary">
                      No picks.
                    </td>
                  </tr>
                )}
                {view.picks.map((p) => (
                  <tr key={`${p.season}/${p.round}/${p.from?.cid ?? cid}`}>
                    <td>{draftName(p.season)}</td>
                    <td className="text-end">{p.round}</td>
                    <td className="text-end">
                      {p.pick !== null ? (
                        p.pick
                      ) : p.projected ? (
                        <span
                          className="text-body-secondary"
                          title={
                            p.projected.lottery
                              ? "Projected if the season ended today: in the lottery pool, so the draw can move it"
                              : "Projected if the season ended today"
                          }
                        >
                          ~{p.projected.pick}
                          {p.projected.lottery ? " (lottery)" : ""}
                        </span>
                      ) : (
                        <span className="text-body-secondary">–</span>
                      )}
                    </td>
                    <td>{p.from ? <TeamLink team={p.from} /> : "Own"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.tradedAway.length > 0 && (
            <>
              <h2 className="h6 mt-3">Traded away</h2>
              <ul className="small" data-testid="draft-picks-away">
                {view.tradedAway.map((p) => (
                  <li key={`${p.season}/${p.round}`}>
                    {draftName(p.season)}, round {p.round}: held by <TeamLink team={p.holder} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
