/** Dashboard (SPEC §11): next match, form, position, board confidence, alerts, the inbox. */
import { InboxPanel } from "../components/InboxPanel";
import { InjuryTag } from "../components/InjuryTag";
import type { DashboardView, MatchView } from "../../common/api";
import { RESULT_LABEL, resultForClub, resultRowClass } from "../components/results";
import { DataTable } from "../components/DataTable";
import { FormBadges, PlayerLink, ScoreLink, TeamLink } from "../components/links";
import { ZONE_CLASS } from "../components/zones";
import { crestUrl } from "../crests";
import { formatDate, formatEuros, ordinal } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { NextMatchButtons } from "../components/PlayButtons";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

function MatchRow({ m }: { m: MatchView }) {
  const { shell } = useShell();
  const result = resultForClub(m, shell.userCid);
  return (
    <tr className={resultRowClass(result)} data-result={result ?? undefined}>
      <td className="text-nowrap text-body-secondary">{formatDate(m.date)}</td>
      <td className="small text-body-secondary">{m.competitionName}</td>
      <td className="text-end">
        <TeamLink team={m.home} />
      </td>
      <td className="text-center">
        <ScoreLink fid={m.fid} score={m.score} />
        {result && <span className="visually-hidden"> {RESULT_LABEL[result]}</span>}
      </td>
      <td>
        <TeamLink team={m.away} />
      </td>
    </tr>
  );
}

function NextMatch({ view }: { view: DashboardView }) {
  const m = view.nextMatch;
  if (!m) return <p className="text-body-secondary mb-0">No more matches this season.</p>;
  const home = m.home.cid === view.user.cid;
  const opponent = home ? m.away : m.home;
  return (
    <div data-testid="next-match">
      <div className="small text-body-secondary mb-2">
        {formatDate(m.date)} · {m.competitionName}
        {m.round && !/^\d+$/.test(m.round) ? ` · ${m.round}` : ""} ·{" "}
        {m.neutral ? "neutral venue" : home ? "home" : "away"}
      </div>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        {[m.home, m.away].map((t, i) => (
          <div key={t.cid} className="d-flex align-items-center gap-2">
            {i === 1 && <span className="text-body-secondary">v</span>}
            <img src={crestUrl(t.code)} alt="" width={36} height={42} />
            <TeamLink team={t} />
          </div>
        ))}
      </div>
      <div className="small mt-2">
        {opponent.name}: {m.opponentPosition ? `${ordinal(m.opponentPosition)} · ` : ""}
        <FormBadges form={m.opponentForm} />
      </div>
      <div className="mt-2">
        <NextMatchButtons />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { shell } = useShell();
  const { data: view, error } = useView("dashboard", () => toWorker("getDashboard", shell.lid));
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const r = view.record;
  const gd = r.goalsFor - r.goalsAgainst;
  const a = view.alerts;
  const around = (() => {
    const i = view.table.findIndex((row) => row.cid === view.user.cid);
    const from = Math.max(0, Math.min(i - 3, view.table.length - 7));
    return view.table.slice(from, from + 7);
  })();
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="row g-3">
        <div className="col-xl-8">
          <section className="card mb-3" data-testid="club-summary">
            <div className="card-body">
              <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                <img src={crestUrl(view.user.code)} alt="" width={44} height={51} />
                <div>
                  <div className="h5 mb-0">{view.user.name}</div>
                  <div className="text-body-secondary small">
                    {view.position
                      ? `${ordinal(view.position)} in the ${view.user.leagueName}`
                      : view.user.leagueName}{" "}
                    · P{r.played} W{r.won} D{r.drawn} L{r.lost} · {r.points} pts · GD{" "}
                    {gd > 0 ? `+${gd}` : gd}
                  </div>
                </div>
                <div className="ms-auto small">
                  Form <FormBadges form={view.form} />
                </div>
              </div>
              <h2 className="h6">Next match</h2>
              <NextMatch view={view} />
            </div>
          </section>
          {/* One above the other: side by side, two club names to a row don't fit. */}
          <div className="row g-3 mb-3">
            <section className="col-12">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h6">Coming up</h2>
                  {view.upcoming.length === 0 ? (
                    <p className="small text-body-secondary mb-0">Nothing else scheduled yet.</p>
                  ) : (
                    <table className="table table-striped table-hover table-sm small mb-0">
                      <tbody>
                        {view.upcoming.map((m) => (
                          <MatchRow key={m.fid} m={m} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
            <section className="col-12">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h6">Recent results</h2>
                  {view.recent.length === 0 ? (
                    <p className="small text-body-secondary mb-0">No games played yet.</p>
                  ) : (
                    <table
                      className="table table-striped table-hover table-sm small mb-0"
                      data-testid="recent-results"
                    >
                      <tbody>
                        {view.recent.map((m) => (
                          <MatchRow key={m.fid} m={m} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>
          <div className="row g-3">
            <section className="col-md-6">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h6">
                    <Link to={leaguePath(shell.lid, "standings")}>{view.user.leagueName}</Link>
                  </h2>
                  <table
                    className="table table-striped table-hover table-sm small mb-0"
                    data-testid="mini-table"
                  >
                    <thead>
                      <tr>
                        <th className="text-end">#</th>
                        <th>Club</th>
                        <th className="text-end">P</th>
                        <th className="text-end">GD</th>
                        <th className="text-end">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {around.map((row) => (
                        <tr
                          key={row.cid}
                          className={`${row.zone ? ZONE_CLASS[row.zone] : ""} ${row.cid === view.user.cid ? "fw-semibold" : ""}`}
                        >
                          <td className="text-end">{row.position}</td>
                          <td>
                            <TeamLink team={row} />
                          </td>
                          <td className="text-end">{row.played}</td>
                          <td className="text-end">
                            {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                          </td>
                          <td className="text-end">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <section className="col-md-6">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h6">Top performers</h2>
                  <DataTable
                    testId="top-players"
                    rows={view.topPlayers}
                    rowKey={(p) => p.pid}
                    pageSize={0}
                    empty="Shown after three appearances."
                    initialSort={{ key: "rating", desc: true }}
                    columns={[
                      {
                        key: "name",
                        label: "Player",
                        value: (p) => p.name,
                        render: (p) => <PlayerLink pid={p.pid} name={p.name} />,
                      },
                      { key: "pos", label: "Pos", value: (p) => p.position },
                      { key: "apps", label: "Apps", value: (p) => p.appearances, align: "end" },
                      {
                        key: "goals",
                        label: "G",
                        title: "Goals",
                        value: (p) => p.goals,
                        align: "end",
                      },
                      {
                        key: "assists",
                        label: "A",
                        title: "Assists",
                        value: (p) => p.assists,
                        align: "end",
                      },
                      {
                        key: "rating",
                        label: "Rating",
                        value: (p) => p.rating,
                        render: (p) => p.rating.toFixed(2),
                        align: "end",
                      },
                    ]}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
        <div className="col-xl-4">
          <section className="card mb-3" data-testid="board">
            <div className="card-body">
              <h2 className="h6">The board</h2>
              <p className="small mb-2">Target: {view.board.target || "to be set"}</p>
              {view.board.confidence !== null && (
                <>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label="Board confidence"
                    aria-valuenow={Math.round(view.board.confidence)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`progress-bar ${view.board.confidence < 35 ? "bg-danger" : view.board.confidence < 50 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${view.board.confidence}%` }}
                    />
                  </div>
                  <div className="small text-body-secondary mt-1">
                    Confidence {Math.round(view.board.confidence)} of 100
                  </div>
                </>
              )}
              <div className="small mt-2">Cash {formatEuros(view.cash)}</div>
            </div>
          </section>
          <section className="card mb-3" data-testid="alerts">
            <div className="card-body">
              <h2 className="h6">Alerts</h2>
              <ul className="list-unstyled small mb-0">
                {a.injured.map((p) => (
                  <li key={p.pid}>
                    <InjuryTag injury={p} today={shell.state.date} className="me-1" />
                    <PlayerLink pid={p.pid} name={p.name} /> ({p.position}): {p.type}, back{" "}
                    {formatDate(p.until)}
                  </li>
                ))}
                {a.tired.map((p) => (
                  <li key={p.pid}>
                    <span className="badge text-bg-warning me-1">Tired</span>
                    <PlayerLink pid={p.pid} name={p.name} /> ({p.position}): {p.condition}%
                  </li>
                ))}
                {a.expiring > 0 && (
                  <li>
                    <span className="badge text-bg-info me-1">Contracts</span>
                    <Link to={leaguePath(shell.lid, "squad", view.user.cid)}>
                      {a.expiring} contract{a.expiring === 1 ? "" : "s"} end this June
                    </Link>
                  </li>
                )}
                {a.bids > 0 && (
                  <li>
                    <span className="badge text-bg-primary me-1">Bids</span>
                    <Link to={leaguePath(shell.lid, "transfer-market", "offers")}>
                      {a.bids} bid{a.bids === 1 ? "" : "s"} for your players
                    </Link>
                  </li>
                )}
                {a.injured.length + a.tired.length + a.expiring + a.bids === 0 && (
                  <li className="text-body-secondary">Nothing needs your attention.</li>
                )}
              </ul>
            </div>
          </section>
          <InboxPanel messages={view.inbox} />
        </div>
      </div>
    </>
  );
}
