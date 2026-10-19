/** Box score (SPEC §11): a played match's stats, key events and player ratings. */
import { BoxScore } from "../components/BoxScore";
import { PlayerLink, TeamLink } from "../components/links";
import { formatDate } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function BoxScorePage({ params }: { params: string[] }) {
  const { shell } = useShell();
  const fid = Number(params[0]);
  const { data: view, error } = useView(`box/${fid}`, () =>
    toWorker("getBoxScore", shell.lid, fid),
  );
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const m = view.match;
  return (
    <>
      <PageHeader title="Box score" />
      <p className="small text-body-secondary" data-testid="box-score-meta">
        {formatDate(m.date)} · {m.competitionName}
        {m.round && !/^\d+$/.test(m.round) ? ` · ${m.round}` : ` · round ${m.round}`}
        {m.leg ? ` · leg ${m.leg}` : ""}
        {m.neutral ? " · neutral venue" : ""} ·{" "}
        <Link to={leaguePath(shell.lid, "game-log", m.home.cid)}>{m.home.name} game log</Link> ·{" "}
        <Link to={leaguePath(shell.lid, "game-log", m.away.cid)}>{m.away.name} game log</Link>
      </p>
      {view.result ? (
        <div data-testid="box-score">
          <BoxScore
            home={m.home}
            away={m.away}
            players={view.players}
            result={view.result}
            renderName={(pid, name) => <PlayerLink pid={pid} name={name} />}
          />
        </div>
      ) : (
        <div className="alert alert-secondary" data-testid="box-score-missing">
          <TeamLink team={m.home} /> v <TeamLink team={m.away} />:{" "}
          {m.score === null
            ? "not played yet."
            : `${m.score}. Match details are kept for two seasons (your own club's forever).`}
        </div>
      )}
    </>
  );
}
