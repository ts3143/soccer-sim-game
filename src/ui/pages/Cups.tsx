/**
 * Cups (SPEC §11): each cup and the play-offs, round by round; two-legged ties together.
 * In a world without cups (the Super League, SPEC §17.8) it's the Play-offs page; a play-off
 * not drawn yet shows its first round if the season ended today.
 */
import type { CupTie } from "../../common/api";
import { ScoreLink, TeamLink } from "../components/links";
import { crestUrl } from "../crests";
import { formatDate } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

function Tie({ tie, userCid }: { tie: CupTie; userCid: number }) {
  const user = tie.home.cid === userCid || tie.away.cid === userCid;
  const won = (cid: number) => (tie.winner?.cid === cid ? "fw-semibold" : "");
  return (
    <div
      className={`border rounded p-2 mb-2 small ${user ? "border-primary" : ""}`}
      data-testid="cup-tie"
    >
      <div className={won(tie.home.cid)}>
        <TeamLink team={tie.home} />
      </div>
      <div className={won(tie.away.cid)}>
        <TeamLink team={tie.away} />
      </div>
      <div className="text-body-secondary mt-1">
        {tie.legs.map((leg) => (
          <div key={leg.fid}>
            {tie.legs.length > 1 ? `Leg ${leg.leg ?? ""}: ` : ""}
            {leg.home.abbr} <ScoreLink fid={leg.fid} score={leg.score} /> {leg.away.abbr}
            {leg.score === null ? ` · ${formatDate(leg.date)}` : ""}
          </div>
        ))}
        {tie.aggregate && <div>Aggregate {tie.aggregate}</div>}
      </div>
    </div>
  );
}

export function Cups({ params }: { params: string[] }) {
  const { shell } = useShell();
  const competition = params[0] ?? null;
  const season = params[1] ? Number(params[1]) : shell.state.season;
  const { data: view, error } = useView(`cups/${competition}/${season}`, () =>
    toWorker("getCups", shell.lid, competition, season),
  );
  const id = view?.id ?? competition ?? "";
  return (
    <>
      <PageHeader
        title={shell.world.cups ? "Cups" : "Play-offs"}
        season={{ season, to: (s) => leaguePath(shell.lid, "cups", id, s) }}
      />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <ul className="nav nav-pills mb-3">
            {view.competitions.map((c) => (
              <li key={c.id} className="nav-item">
                <Link
                  to={leaguePath(shell.lid, "cups", c.id, season)}
                  className={`nav-link ${c.id === view.id ? "active" : ""}`}
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          {view.winner && (
            <div
              className="alert alert-success d-flex align-items-center gap-2"
              data-testid="cup-winner"
            >
              <img src={crestUrl(view.winner.code)} alt="" width={28} height={32} />
              <span>
                <strong>{view.winner.name}</strong> won the {view.name}.
              </span>
            </div>
          )}
          {view.projection && (
            <section className="card mb-3" data-testid="playoff-projection">
              <div className="card-body py-2">
                <h2 className="h6 mb-1">If the season ended today</h2>
                <div className="small text-body-secondary mb-2">{view.projection.round}</div>
                <div className="d-flex flex-wrap gap-2">
                  {view.projection.ties.map((tie) => (
                    <div
                      key={`${tie.home.cid}-${tie.away.cid}`}
                      className={`border rounded p-2 small ${
                        tie.home.cid === shell.userCid || tie.away.cid === shell.userCid
                          ? "border-primary"
                          : ""
                      }`}
                      style={{ minWidth: 200 }}
                    >
                      <div>
                        {tie.home.position}. <TeamLink team={tie.home} />
                      </div>
                      <div>
                        {tie.away.position}. <TeamLink team={tie.away} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
          <div className="d-flex gap-3 overflow-auto pb-2" data-testid="cup-rounds">
            {view.rounds.map((round) => (
              <section key={round.name} style={{ minWidth: 220, maxWidth: 260 }}>
                <h2 className="h6 mb-1">{round.name}</h2>
                <div className="small text-body-secondary mb-2">
                  {round.date ? formatDate(round.date) : "Drawn when the previous round ends"}
                </div>
                {round.ties.map((tie) => (
                  <Tie key={`${tie.home.cid}-${tie.away.cid}`} tie={tie} userCid={shell.userCid} />
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
