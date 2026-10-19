/**
 * Watch live (M6, SPEC §11): the user's match as it happens. Chunk 2's first version: the
 * score and clock, play and pause, straight to full time, the feed and a few stats. The
 * pre-match screen, energy bars, the speed slider and in-match changes follow.
 */
import { useEffect, useRef, useState } from "react";
import type { LiveMatchView } from "../../common/api";
import type { MatchEvent } from "../../common/match";
import { feedLine, minuteLabel, type FeedContext } from "../components/matchText";
import { crestUrl } from "../crests";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Possessions per step, and the pause between steps (ms). */
const STEP = 3;
const TICK = 300;

interface Line {
  clock: number;
  text: string;
  goal: boolean;
}

/** The feed's lines, newest first (each event read in the period it happened in). */
function feedLines(
  feed: readonly MatchEvent[],
  ctx: FeedContext,
  start: LiveMatchView["period"],
): Line[] {
  const lines: Line[] = [];
  let period = start;
  for (const event of feed) {
    if (event.type === "kickoff") period = event.period;
    const text = feedLine(event, ctx, period);
    // Shoot-out kicks have no clock: they follow extra time.
    const clock = "clock" in event ? event.clock : 120 * 60;
    if (text) lines.push({ clock, text, goal: event.type === "goal" });
  }
  return lines.reverse();
}

export function Live() {
  const { shell } = useShell();
  const [view, setView] = useState<LiveMatchView | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    toWorker("getLiveMatch", shell.lid, 0)
      .then((v) => {
        if (!alive) return;
        if (v) {
          setView(v);
          setFeed(v.events);
        } else setMissing(true);
      })
      .catch((e: unknown) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [shell.lid]);

  const step = async (possessions: number) => {
    if (busy.current || !view || view.report) return;
    busy.current = true;
    try {
      const next = await toWorker("stepLiveMatch", shell.lid, possessions, feed.length);
      setFeed((f) => [...f, ...next.events]);
      setView(next);
      if (next.report) setRunning(false);
    } catch (e) {
      setError(errorText(e));
      setRunning(false);
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (!running || !view || view.report) return;
    const timer = setTimeout(() => void step(STEP), TICK);
    return () => clearTimeout(timer);
  });

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (missing && !view) {
    return (
      <>
        <PageHeader title="Live match" />
        <p className="text-body-secondary">
          No match is being watched. Use Play → Watch your next match.
        </p>
      </>
    );
  }
  if (!view) return <p>Loading…</p>;

  const [home, away] = view.teams;
  const ctx: FeedContext = {
    name: (pid) => (pid === null ? "?" : (view.players[pid]?.name ?? `#${pid}`)),
    team: (side) => view.teams[side].team.name,
  };
  const lines = feedLines(feed, ctx, view.period);
  const done = view.report !== null;
  const stat = (label: string, h: string | number, a: string | number) => (
    <tr key={label}>
      <td className="text-end">{h}</td>
      <td className="text-center text-body-secondary">{label}</td>
      <td>{a}</td>
    </tr>
  );

  return (
    <>
      <PageHeader title="Live match" />
      <div className="small text-body-secondary mb-2">
        {view.competitionName} · {view.round}
        {view.leg ? ` · leg ${view.leg}` : ""}
      </div>
      <section className="card mb-3" data-testid="live-scoreboard">
        <div className="card-body d-flex align-items-center justify-content-center gap-4 flex-wrap">
          <div className="d-flex align-items-center gap-2 fw-semibold">
            <img src={crestUrl(home.team.code)} alt="" width={30} height={35} />
            {home.team.name}
          </div>
          <div className="text-center">
            <div className="display-6 fw-bold" data-testid="live-score">
              {view.score[0]} – {view.score[1]}
            </div>
            {view.shootout && (
              <div className="small">
                pens {view.shootout[0]}–{view.shootout[1]}
              </div>
            )}
            <div className="small text-body-secondary" data-testid="live-clock">
              {done
                ? "Full time"
                : view.clock === 0
                  ? "Kick-off"
                  : minuteLabel(view.clock, view.period)}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 fw-semibold">
            {away.team.name}
            <img src={crestUrl(away.team.code)} alt="" width={30} height={35} />
          </div>
        </div>
      </section>
      {done ? (
        <div
          className="alert alert-success d-flex flex-wrap gap-3 align-items-center"
          data-testid="live-done"
        >
          <span>Full time. The match and the rest of the day are saved.</span>
          <Link to={leaguePath(shell.lid, "box-score", view.fid)}>Box score</Link>
          <Link to={leaguePath(shell.lid)}>Dashboard</Link>
        </div>
      ) : (
        <div className="d-flex gap-2 mb-3">
          <button
            type="button"
            className="btn btn-success"
            onClick={() => setRunning((r) => !r)}
            data-testid="live-play"
          >
            {running ? "Pause" : view.clock === 0 ? "Kick off" : "Play"}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setRunning(false);
              void step(Infinity);
            }}
            data-testid="live-end"
          >
            To full time
          </button>
        </div>
      )}
      <div className="row g-3">
        <div className="col-lg-7">
          <section className="card">
            <div className="card-body">
              <h2 className="h6">Commentary</h2>
              <ul
                className="list-unstyled small mb-0"
                data-testid="live-feed"
                style={{ maxHeight: 420, overflowY: "auto" }}
              >
                {lines.map((l, i) => (
                  <li key={i} className={l.goal ? "fw-semibold" : ""}>
                    <span className="text-body-secondary me-2">{minuteLabel(l.clock)}</span>
                    {l.text}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
        <div className="col-lg-5">
          <section className="card">
            <div className="card-body">
              <h2 className="h6">Stats</h2>
              <table className="table table-sm small mb-0" data-testid="live-stats">
                <tbody>
                  {stat(
                    "Possession",
                    `${Math.round(home.stats.possession * 100)}%`,
                    `${Math.round(away.stats.possession * 100)}%`,
                  )}
                  {stat("Shots", home.stats.shots, away.stats.shots)}
                  {stat("On target", home.stats.shotsOnTarget, away.stats.shotsOnTarget)}
                  {stat("xG", home.stats.xg.toFixed(2), away.stats.xg.toFixed(2))}
                  {stat("Corners", home.stats.corners, away.stats.corners)}
                  {stat("Fouls", home.stats.fouls, away.stats.fouls)}
                  {stat("Yellow cards", home.stats.yellowCards, away.stats.yellowCards)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
