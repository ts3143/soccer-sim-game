/** Game Log (SPEC §11): a club's season of matches in every competition. */
import { DataTable } from "../components/DataTable";
import { FormBadges, ScoreLink, TeamLink } from "../components/links";
import { formatDate } from "../format";
import { leaguePath } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { NextMatchButtons } from "../components/PlayButtons";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const VENUE: Record<string, string> = { H: "Home", A: "Away", N: "Neutral" };

export function GameLog({ params }: { params: string[] }) {
  const { shell } = useShell();
  const cid = params[0] !== undefined ? Number(params[0]) : shell.userCid;
  const season = params[1] ? Number(params[1]) : shell.state.season;
  const { data: view, error } = useView(`game-log/${cid}/${season}`, () =>
    toWorker("getGameLog", shell.lid, cid, season),
  );
  return (
    <>
      <PageHeader
        title="Game Log"
        team={{ cid, page: "game-log", extra: [season] }}
        season={{ season, to: (s) => leaguePath(shell.lid, "game-log", cid, s) }}
      />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="small text-body-secondary" data-testid="game-log-record">
            All competitions: W{view.record.won} D{view.record.drawn} L{view.record.lost} · goals{" "}
            {view.record.goalsFor}–{view.record.goalsAgainst}
          </p>
          {cid === shell.userCid &&
            season === shell.state.season &&
            shell.state.nextUserFixture && (
              <div
                className="d-flex flex-wrap align-items-center gap-3 mb-2 small"
                data-testid="next-fixture"
              >
                <span>Next: {formatDate(shell.state.nextUserFixture.date)}</span>
                <NextMatchButtons />
              </div>
            )}
          <DataTable
            testId="game-log"
            rows={view.matches}
            rowKey={(r) => r.match.fid}
            pageSize={0}
            columns={[
              {
                key: "date",
                label: "Date",
                value: (r) => r.match.date,
                render: (r) => formatDate(r.match.date),
                desc: false,
              },
              { key: "comp", label: "Competition", value: (r) => r.match.competitionName },
              { key: "venue", label: "Venue", value: (r) => VENUE[r.venue] },
              {
                key: "opp",
                label: "Opponent",
                value: (r) => r.opponent.name,
                render: (r) => <TeamLink team={r.opponent} />,
              },
              {
                key: "res",
                label: "",
                render: (r) => (r.result ? <FormBadges form={[r.result]} /> : ""),
              },
              {
                key: "score",
                label: "Score",
                render: (r) => <ScoreLink fid={r.match.fid} score={r.match.score} />,
                align: "center",
              },
            ]}
          />
        </>
      )}
    </>
  );
}
