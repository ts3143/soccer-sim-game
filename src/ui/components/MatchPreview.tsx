/**
 * The pre-match card of a watched match (T, 2026-10-25): both clubs' last five results,
 * their latest meeting, and a derby when both come from the same city.
 */
import type { TeamRef } from "../../common/api";
import { formatDate } from "../format";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";
import { FormStrip, ScoreLink, TeamLink } from "./links";

export function MatchPreview({ fid, teams }: { fid: number; teams: readonly [TeamRef, TeamRef] }) {
  const { shell } = useShell();
  const { data: view, error } = useView(`match-preview/${fid}`, () =>
    toWorker("getMatchPreview", shell.lid, fid),
  );
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return null;
  const met = view.lastMeeting;
  return (
    <section className="card" data-testid="match-preview">
      <div className="card-body small">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">Match preview</h2>
          {view.derby && (
            <span className="badge text-bg-danger" data-testid="derby">
              {view.derby} derby
            </span>
          )}
        </div>
        <div className="row g-3">
          <div className="col-md-6">
            <h3 className="h6 small text-uppercase text-body-secondary">Last five</h3>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                {teams.map((team, i) => (
                  <tr key={team.cid} data-testid="preview-form">
                    <td>
                      <TeamLink team={team} />
                    </td>
                    <td className="text-end">
                      <FormStrip matches={view.form[i as 0 | 1]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="col-md-6" data-testid="last-meeting">
            <h3 className="h6 small text-uppercase text-body-secondary">Last meeting</h3>
            {met ? (
              <>
                <div>
                  <TeamLink team={met.home} /> <ScoreLink fid={met.fid} score={met.score} />{" "}
                  <TeamLink team={met.away} />
                </div>
                <div className="text-body-secondary">
                  {met.competitionName}, {formatDate(met.date)}
                </div>
              </>
            ) : (
              <span className="text-body-secondary">They haven&apos;t met in this save.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
