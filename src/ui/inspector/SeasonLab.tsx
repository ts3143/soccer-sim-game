/**
 * M3 Season lab (developer-only; the game screens replace it in M5): play the season with
 * the Play-menu actions and see the tables, results, cups, play-offs, injuries, academy,
 * transactions and awards. Times each action against the 60-second season budget.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  PlayOption,
  PlayReport,
  SeasonLabKnockout,
  SeasonLabMatch,
  SeasonLabView,
  TableZone,
} from "../../common/api";
import { crestUrl } from "../crests";
import { formatDate } from "../format";
import { onWorkerEvent, toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const OPTION_LABELS: Record<PlayOption, string> = {
  untilNextMatch: "Until next match",
  oneWeek: "One week",
  untilWindowCloses: "Until window closes",
  untilEndOfSeason: "Until end of season",
  proceedToPromotionRelegation: "Proceed to promotion/relegation",
  advanceToPreseason: "Advance to preseason",
};

const PHASE_LABELS: Record<string, string> = {
  preseason: "Preseason",
  regularSeason: "Regular season",
  endOfSeason: "End of season",
};

const ZONE_CLASS: Record<Exclude<TableZone, null>, string> = {
  champions: "table-success",
  promoted: "table-success",
  playoffs: "table-info",
  relegated: "table-danger",
};

const AWARD_LABELS: Record<string, string> = {
  champions: "Champions",
  playerOfTheYear: "Player of the Year",
  goldenBoot: "Golden Boot",
  teamOfTheSeason: "Team of the Season",
  cupWinner: "Cup winners",
  playoffWinner: "Play-off winners",
  promoted: "Promoted",
  relegated: "Relegated",
};

const TRANSACTION_LABELS: Record<string, string> = {
  retirement: "Retirements and departures",
  academyPromotion: "Academy promotions",
  release: "Academy releases",
  freeAgent: "Free-agent signings",
};

/** Runs `work` and returns its result with the wall-clock seconds it took. */
async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await work();
  return [result, (performance.now() - started) / 1000];
}

const seasonLabel = (season: number) => `${season}/${String((season + 1) % 100).padStart(2, "0")}`;

function Crest({ code, size = 18 }: { code: string; size?: number }) {
  return <img src={crestUrl(code)} alt="" width={size} height={Math.round(size * 1.15)} />;
}

function MatchLine({ m, userCid }: { m: SeasonLabMatch; userCid: number }) {
  const user = m.home.cid === userCid || m.away.cid === userCid;
  const won = (cid: number) => (m.winnerCid === cid ? "fw-semibold" : "");
  return (
    <div className={`d-flex align-items-center gap-2 small ${user ? "fw-semibold" : ""}`}>
      <span className={`text-end flex-fill ${won(m.home.cid)}`}>{m.home.name}</span>
      <Crest code={m.home.code} size={14} />
      <span className="font-monospace text-nowrap text-center" style={{ minWidth: "8.5em" }}>
        {m.score ?? "v"}
      </span>
      <Crest code={m.away.code} size={14} />
      <span className={`flex-fill ${won(m.away.cid)}`}>{m.away.name}</span>
    </div>
  );
}

/** One line per match for the narrow cup cards: "Home 2–1 Away", the winner in bold. */
function CompactMatch({ m, userCid }: { m: SeasonLabMatch; userCid: number }) {
  const side = (t: SeasonLabMatch["home"]) => (
    <span className={m.winnerCid === t.cid ? "fw-semibold" : ""}>
      {t.cid === userCid ? <u>{t.name}</u> : t.name}
    </span>
  );
  return (
    <div className="small">
      {m.leg && <span className="text-body-secondary">Leg {m.leg}: </span>}
      {side(m.home)} <span className="font-monospace">{m.score ?? "v"}</span> {side(m.away)}
      {m.neutral && <span className="text-body-secondary"> (neutral)</span>}
    </div>
  );
}

function Knockout({ k, userCid }: { k: SeasonLabKnockout; userCid: number }) {
  return (
    <div className="card h-100" data-testid={`knockout-${k.id}`}>
      <div className="card-body">
        <h3 className="h6 text-uppercase text-body-secondary">{k.name}</h3>
        {k.rounds.map((round) => {
          const played = round.matches.filter((m) => m.score !== null).length;
          return (
            <div key={round.name} className="mb-2">
              <div className="small text-body-secondary">
                {round.name}
                {round.date ? ` · ${formatDate(round.date)}` : " · not drawn yet"}
                {round.matches.length > 4 && ` · ${round.matches.length} ties, ${played} played`}
              </div>
              {round.matches.length <= 4 &&
                round.matches.map((m) => <CompactMatch key={m.fid} m={m} userCid={userCid} />)}
            </div>
          );
        })}
        <div className="small mt-2">
          Winner: <strong>{k.winner ? k.winner.name : "to be decided"}</strong>
        </div>
      </div>
    </div>
  );
}

export function SeasonLab({ lid }: { lid: number }) {
  const [view, setView] = useState<SeasonLabView | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const [busy, setBusy] = useState<PlayOption | null>(null);
  const [last, setLast] = useState<{
    report: PlayReport;
    seconds: number;
    option: PlayOption;
  } | null>(null);
  const [seasonTimes, setSeasonTimes] = useState<{ season: number; seconds: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    toWorker("getSeasonLab", lid)
      .then((v) => {
        setView(v);
        setLeague((id) => id ?? v.user.leagueId);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [lid]);

  useEffect(() => {
    load();
    return onWorkerEvent("gameChanged", (event) => {
      if (event.lid === lid) load();
    });
  }, [lid, load]);

  const play = async (option: PlayOption) => {
    setBusy(option);
    setError(null);
    const season = view?.state.season ?? 0;
    try {
      const [report, seconds] = await timed(() => toWorker("playGame", lid, option));
      setLast({ report, seconds, option });
      if (option === "untilEndOfSeason" && report.from.endsWith("-07-01")) {
        setSeasonTimes((t) => [...t, { season, seconds }]);
      }
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!view)
    return error ? <div className="alert alert-danger">{error}</div> : <p>Loading season…</p>;
  const { state } = view;
  const table = view.leagues.find((l) => l.id === league) ?? view.leagues[0];

  return (
    <>
      <section className="card mb-4" data-testid="season-header">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <h3 className="h5 mb-0 me-2">Season {seasonLabel(state.season)}</h3>
            <span className="badge text-bg-secondary">{formatDate(state.date)}</span>
            <span className="badge text-bg-primary">
              {PHASE_LABELS[state.phase] ?? state.phase}
            </span>
            {state.window && (
              <span className="badge text-bg-warning">
                {state.window.id === "summer" ? "Summer" : "Winter"} window open until{" "}
                {formatDate(state.window.closes)}
              </span>
            )}
          </div>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {state.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-sm ${option === state.options[0] ? "btn-primary" : "btn-outline-primary"}`}
                disabled={busy !== null}
                onClick={() => void play(option)}
              >
                {busy === option ? "Playing…" : OPTION_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="small mb-1">
            <Crest code={view.user.code} size={16} /> <strong>{view.user.name}</strong>
            {view.nextUserMatch ? (
              <>
                {" "}
                · next: {view.nextUserMatch.competitionName}, {formatDate(view.nextUserMatch.date)}:{" "}
                {view.nextUserMatch.home.cid === view.user.cid
                  ? `v ${view.nextUserMatch.away.name} (home)`
                  : `at ${view.nextUserMatch.home.name}`}
              </>
            ) : (
              " · no match scheduled"
            )}
          </p>
          {last && (
            <p className="small text-body-secondary mb-1" data-testid="last-action">
              {OPTION_LABELS[last.option]}: {formatDate(last.report.from)} →{" "}
              {formatDate(last.report.to)}, {last.report.matchesPlayed.toLocaleString("en-GB")}{" "}
              matches in {last.seconds.toFixed(1)} s
              {last.report.events.length > 0 &&
                ` · ${last.report.events.map((e) => `${e.kind}${e.window ? ` (${e.window})` : ""}`).join(", ")}`}
            </p>
          )}
          {seasonTimes.map((t) => (
            <p key={t.season} className="small mb-1" data-testid="season-time">
              <span className={t.seconds < 60 ? "text-success" : "text-danger"}>
                {t.seconds < 60 ? "✓" : "✗"}
              </span>{" "}
              Whole season {seasonLabel(t.season)} played in the browser in{" "}
              <strong>{t.seconds.toFixed(1)} s</strong> (budget 60 s, saving included).
            </p>
          ))}
          {error && <div className="alert alert-danger mt-2 mb-0">{error}</div>}
        </div>
      </section>

      <div className="row g-3 mb-4">
        <div className="col-xl-7">
          <section className="card h-100">
            <div className="card-body">
              <ul className="nav nav-tabs mb-2">
                {view.leagues.map((l) => (
                  <li className="nav-item" key={l.id}>
                    <button
                      type="button"
                      className={`nav-link py-1 ${l.id === table?.id ? "active" : ""}`}
                      onClick={() => setLeague(l.id)}
                    >
                      {l.name}
                    </button>
                  </li>
                ))}
              </ul>
              {table && (
                <div className="table-responsive">
                  <table
                    className="table table-sm small align-middle mb-0"
                    data-testid="league-table"
                  >
                    <thead>
                      <tr>
                        <th className="text-end">#</th>
                        <th colSpan={2}>Club</th>
                        <th className="text-end">P</th>
                        <th className="text-end">W</th>
                        <th className="text-end">D</th>
                        <th className="text-end">L</th>
                        <th className="text-end">GF</th>
                        <th className="text-end">GA</th>
                        <th className="text-end">GD</th>
                        <th className="text-end">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((r) => (
                        <tr
                          key={r.cid}
                          className={`${r.zone ? ZONE_CLASS[r.zone] : ""} ${r.cid === view.user.cid ? "fw-semibold" : ""}`}
                        >
                          <td className="text-end">{r.position}</td>
                          <td style={{ width: 24 }}>
                            <Crest code={r.code} size={16} />
                          </td>
                          <td>{r.name}</td>
                          <td className="text-end">{r.played}</td>
                          <td className="text-end">{r.won}</td>
                          <td className="text-end">{r.drawn}</td>
                          <td className="text-end">{r.lost}</td>
                          <td className="text-end">{r.goalsFor}</td>
                          <td className="text-end">{r.goalsAgainst}</td>
                          <td className="text-end">
                            {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                          </td>
                          <td className="text-end fw-semibold">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="small text-body-secondary mt-2 mb-0">
                Green: champions and promotion · blue: play-offs · red: relegation. Tie-breakers
                from each league&apos;s config.
              </p>
            </div>
          </section>
        </div>
        <div className="col-xl-5">
          <section className="card h-100">
            <div className="card-body">
              <h3 className="h6 text-uppercase text-body-secondary">
                Latest results{view.latest ? ` · ${formatDate(view.latest.date)}` : ""}
              </h3>
              {!view.latest && <p className="small text-body-secondary">No matches played yet.</p>}
              <div className="d-grid gap-1" data-testid="latest-results">
                {view.latest?.matches.slice(0, 24).map((m) => (
                  <div key={m.fid}>
                    <div className="text-body-secondary" style={{ fontSize: "0.7rem" }}>
                      {m.competitionName}
                      {m.leg
                        ? ` · ${m.round}, leg ${m.leg}`
                        : /^\d+$/.test(m.round)
                          ? ` · round ${m.round}`
                          : ` · ${m.round}`}
                      {m.neutral ? " · neutral venue" : ""}
                    </div>
                    <MatchLine m={m} userCid={view.user.cid} />
                  </div>
                ))}
                {view.latest && view.latest.matches.length > 24 && (
                  <p className="small text-body-secondary mb-0">
                    … and {view.latest.matches.length - 24} more.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {[...view.cups, ...view.playoffs].map((k) => (
          <div className="col-lg-4" key={k.id}>
            <Knockout k={k} userCid={view.user.cid} />
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-4">
          <section className="card h-100">
            <div className="card-body small">
              <h3 className="h6 text-uppercase text-body-secondary">Injuries</h3>
              <p className="mb-2" data-testid="injuries">
                {view.injuries.total} senior players injured ({view.injuries.perSquad.toFixed(1)}{" "}
                per squad; target about 3).
              </p>
              <p className="mb-1 text-body-secondary">Most injured squads</p>
              <ul className="list-unstyled mb-2">
                {view.injuries.mostByClub.map(({ team, count }) => (
                  <li key={team.cid}>
                    {team.name}: {count}
                  </li>
                ))}
              </ul>
              <p className="mb-1 text-body-secondary">{view.user.name}</p>
              {view.injuries.user.length === 0 && <p className="mb-0">No injuries.</p>}
              <ul className="list-unstyled mb-0">
                {view.injuries.user.map((p) => (
                  <li key={p.name}>
                    {p.name} ({p.position}): {p.type.toLowerCase()}, back {formatDate(p.until)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
        <div className="col-lg-4">
          <section className="card h-100">
            <div className="card-body small">
              <h3 className="h6 text-uppercase text-body-secondary">Academies</h3>
              <p className="mb-2">
                {view.academy.total} academy players
                {view.academy.intakeThisSeason > 0 &&
                  `, ${view.academy.intakeThisSeason} joined this summer`}
                . Best prospects (displayed POT):
              </p>
              <table className="table table-sm mb-0">
                <tbody>
                  {view.academy.topProspects.map((p) => (
                    <tr key={`${p.name}-${p.club}`}>
                      <td>{p.name}</td>
                      <td className="text-body-secondary">{p.club}</td>
                      <td className="text-end">{p.age}</td>
                      <td className="text-end">
                        {p.ovr} / <strong>{p.pot}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="col-lg-4">
          <section className="card h-100">
            <div className="card-body small">
              <h3 className="h6 text-uppercase text-body-secondary">Transactions this season</h3>
              {Object.keys(view.transactions.counts).length === 0 && (
                <p className="text-body-secondary">
                  None yet: retirements come on 1 June, academy moves and signings on 1 July.
                </p>
              )}
              <ul className="list-unstyled mb-2">
                {Object.entries(view.transactions.counts).map(([type, n]) => (
                  <li key={type}>
                    {TRANSACTION_LABELS[type] ?? type}: {n}
                  </li>
                ))}
              </ul>
              <ul className="list-unstyled mb-0 text-body-secondary">
                {view.transactions.recent.map((t, i) => (
                  <li key={i}>
                    {formatDate(t.date)} · {TRANSACTION_LABELS[t.type] ?? t.type}: {t.text}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>

      {view.awards.length > 0 && (
        <section className="card mb-4" data-testid="awards">
          <div className="card-body small">
            <h3 className="h6 text-uppercase text-body-secondary">
              Season {seasonLabel(state.season)}: honours and awards
            </h3>
            <div className="row g-3">
              {[...new Set(view.awards.map((a) => a.competitionName))].map((competition) => (
                <div className="col-md-6 col-xl-4" key={competition}>
                  <div className="fw-semibold">{competition}</div>
                  {[
                    ...new Set(
                      view.awards
                        .filter((a) => a.competitionName === competition)
                        .map((a) => a.type),
                    ),
                  ].map((type) => (
                    <div key={type}>
                      <span className="text-body-secondary">{AWARD_LABELS[type] ?? type}: </span>
                      {view.awards
                        .filter((a) => a.competitionName === competition && a.type === type)
                        .map((a) => (a.club ? `${a.name} (${a.club})` : a.name))
                        .join(", ")}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
