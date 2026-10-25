/**
 * Watch live (M6, SPEC §11). Before kick-off: the line-up for this match only (the Tactics
 * editor, applied at once) and the opponent's XI. During the match: the score and clock
 * with the scorers, play and pause, a speed slider, the commentary, live stats, and both
 * teams' energy bars and benches. At a pause (or half-time): the tactics board, for
 * substitutions, free position moves, the formation and the sliders.
 */
import { InjuryTag } from "../components/InjuryTag";
import { useEffect, useRef, useState } from "react";
import type {
  LiveBoardView,
  LiveChanges,
  LiveMatchView,
  LivePause,
  LiveTeamView,
  TacticsSetup,
  TacticsView,
} from "../../common/api";
import { addDays } from "../../common/dates";
import type { MatchEvent } from "../../common/match";
import { LineupEditor, type SaveText } from "../components/LineupEditor";
import { MatchPreview } from "../components/MatchPreview";
import { GameError } from "../../common/errors";
import { liveChanges } from "../../common/liveChanges";
import {
  feedLine,
  isKeyMoment,
  minuteLabel,
  type FeedContext,
  type FeedRecent,
} from "../components/matchText";
import { crestUrl } from "../crests";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";
import { errorText } from "../errors";

/** The speed slider: possessions per step and the pause between steps (ms). */
const SPEEDS = [
  { label: "Slow", possessions: 1, tick: 700 },
  { label: "Steady", possessions: 1, tick: 350 },
  { label: "Normal", possessions: 2, tick: 250 },
  { label: "Fast", possessions: 5, tick: 200 },
  { label: "Very fast", possessions: 12, tick: 150 },
];
const SPEED_KEY = "soccer-sim:live-speed";
const DEFAULT_SPEED = 2;

function storedSpeed(): number {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    const n = Number(raw);
    return raw !== null && Number.isInteger(n) && n >= 0 && n < SPEEDS.length ? n : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

function rememberSpeed(n: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(n));
  } catch {
    // Storage blocked: the speed just isn't remembered.
  }
}

/** The commentary shows every chance, or only the key moments. */
const FEED_KEY = "soccer-sim:live-feed";

function storedFullFeed(): boolean {
  try {
    return localStorage.getItem(FEED_KEY) !== "key";
  } catch {
    return true;
  }
}

function rememberFullFeed(full: boolean) {
  try {
    localStorage.setItem(FEED_KEY, full ? "full" : "key");
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}

type LineKind = "goal" | "yellow" | "red" | "sub" | "injury" | "period" | "other";

interface Line {
  /** "23'", "45+2'"; empty for shoot-out kicks. */
  minute: string;
  text: string;
  kind: LineKind;
  key: boolean;
}

function kindOf(event: MatchEvent): LineKind {
  switch (event.type) {
    case "goal":
      return "goal";
    case "card":
      return event.card === "yellow" ? "yellow" : "red";
    case "sub":
      return "sub";
    case "injury":
      return "injury";
    case "kickoff":
    case "periodEnd":
      return "period";
    default:
      return "other";
  }
}

const BADGES: Partial<Record<LineKind, [string, string]>> = {
  goal: ["Goal", "text-bg-success"],
  yellow: ["Yellow", "text-bg-warning"],
  red: ["Red", "text-bg-danger"],
  sub: ["Sub", "text-bg-secondary"],
  injury: ["Injury", "text-bg-danger"],
};

/**
 * The feed's lines, newest first. Each event is read in the period it happened in, with
 * the shot or foul behind it and the score so far.
 */
function feedLines(
  feed: readonly MatchEvent[],
  ctx: FeedContext,
  start: LiveMatchView["period"],
): Line[] {
  const lines: Line[] = [];
  let period = start;
  const score: [number, number] = [0, 0];
  const recent: FeedRecent = { shot: null, foul: null, score };
  for (const event of feed) {
    if (event.type === "kickoff") period = event.period;
    else if (event.type === "shot") recent.shot = event;
    else if (event.type === "foul") recent.foul = event;
    else if (event.type === "goal") score[event.side]++;
    const text = feedLine(event, ctx, recent);
    // Shoot-out kicks have no clock: they follow extra time.
    const minute = "clock" in event ? minuteLabel(event.clock, period) : "";
    if (text) lines.push({ minute, text, kind: kindOf(event), key: isKeyMoment(event) });
  }
  return lines.reverse();
}

const isHalfTime = (view: LiveMatchView) =>
  view.atBreak && view.period === "second" && view.clock === 45 * 60;

const energyClass = (e: number) => (e >= 70 ? "bg-success" : e >= 50 ? "bg-warning" : "bg-danger");

export function Live() {
  const { shell } = useShell();
  const [view, setView] = useState<LiveMatchView | null>(null);
  const [fullFeed, setFullFeed] = useState(storedFullFeed);
  const [lineup, setLineup] = useState<TacticsView | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [pause, setPause] = useState<LivePause | null>(null);
  const [speed, setSpeed] = useState(storedSpeed);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    toWorker("getLiveMatch", shell.lid, 0)
      .then(async (v) => {
        if (!alive) return;
        if (!v) {
          setMissing(true);
          return;
        }
        if (v.clock === 0 && !v.finished) {
          const l = await toWorker("getLiveLineup", shell.lid);
          if (alive) setLineup(l);
        }
        if (!alive) return;
        setView(v);
        setFeed(v.events);
      })
      .catch((e: unknown) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [shell.lid]);

  const step = async (possessions: number, autoPause = true) => {
    if (busy.current || !view || view.report) return;
    busy.current = true;
    try {
      const next = await toWorker("stepLiveMatch", shell.lid, possessions, feed.length, autoPause);
      setFeed((f) => [...f, ...next.events]);
      setView(next);
      setLineup(null);
      if (next.pause) {
        setRunning(false);
        setPause(next.pause);
      }
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
    const { possessions, tick } = SPEEDS[speed] ?? { possessions: 2, tick: 250 };
    const timer = setTimeout(() => void step(possessions), tick);
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

  const done = view.report !== null;
  const preMatch = lineup !== null && view.clock === 0 && !done;
  const ctx: FeedContext = {
    name: (pid) => (pid === null ? "?" : (view.players[pid]?.name ?? `#${pid}`)),
    team: (side) => view.teams[side].team.name,
  };
  const name = (pid: number) => view.players[pid]?.name ?? `#${pid}`;
  const opponent = view.teams[view.userSide === 0 ? 1 : 0];

  return (
    <>
      <PageHeader title="Live match" />
      <div className="small text-body-secondary mb-2">
        {view.competitionName} · {view.round}
        {view.leg ? ` · leg ${view.leg}` : ""}
      </div>
      <Scoreboard view={view} feed={feed} name={name} done={done} />
      {done && (
        <div
          className="alert alert-success d-flex flex-wrap gap-3 align-items-center"
          data-testid="live-done"
        >
          <span>Full time. The match and the rest of the day are saved.</span>
          {view.motm && (
            <span data-testid="live-motm">
              <span className="motm-star" aria-hidden="true">
                ★
              </span>{" "}
              Man of the match: {name(view.motm.pid)} ({view.motm.rating.toFixed(1)})
            </span>
          )}
          <Link to={leaguePath(shell.lid, "box-score", view.fid)}>Box score</Link>
          <Link to={leaguePath(shell.lid)}>Dashboard</Link>
        </div>
      )}
      {!done && (
        <div className="d-flex flex-wrap align-items-center gap-3 mb-3" data-testid="live-controls">
          <button
            type="button"
            className="btn btn-success"
            onClick={() => {
              setPause(null);
              setRunning((r) => !r);
            }}
            data-testid="live-play"
          >
            {running ? "Pause" : view.clock === 0 ? "Kick off" : "Play"}
          </button>
          <div className="d-flex align-items-center gap-2">
            <label htmlFor="live-speed" className="small text-body-secondary">
              Speed
            </label>
            <input
              id="live-speed"
              type="range"
              className="form-range"
              style={{ width: 140 }}
              min={0}
              max={SPEEDS.length - 1}
              step={1}
              value={speed}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSpeed(n);
                rememberSpeed(n);
              }}
            />
            <span className="small" data-testid="live-speed-label">
              {SPEEDS[speed]?.label}
            </span>
          </div>
          {!preMatch && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setRunning(false);
                setPause(null);
                void step(Infinity, false);
              }}
              data-testid="live-end"
              title="Plays the rest straight away. Your team makes no changes on the way."
            >
              To full time
            </button>
          )}
        </div>
      )}
      {!preMatch && !running && !done && view.clock > 0 && (
        <ChangesPanel
          view={view}
          pause={pause ?? (isHalfTime(view) ? { reason: "halfTime", pid: null } : null)}
          onApplied={(next) => {
            setFeed((f) => [...f, ...next.events]);
            setView(next);
          }}
          onResume={() => {
            setPause(null);
            setRunning(true);
          }}
        />
      )}
      {preMatch ? (
        <div className="row g-3" data-testid="pre-match">
          <div className="col-12">
            <MatchPreview fid={view.fid} teams={[view.teams[0].team, view.teams[1].team]} />
          </div>
          <div className="col-xxl-9">
            <h2 className="h5">Your line-up for this match</h2>
            <LineupEditor
              initial={lineup}
              apply={(setup, mode) => toWorker("setLiveLineup", shell.lid, setup, mode)}
              note="Changes here are for this match only: your saved Tactics stay as they are. Injured and suspended players are greyed out under Not in the squad: they can't play."
              autoTitle="The AI's rotation for this match"
              baselineLabel="the line-up you started with"
            />
          </div>
          <div className="col-xxl-3">
            <section className="card" data-testid="opponent-xi">
              <div className="card-body small">
                <h2 className="h6">
                  {opponent.team.name}{" "}
                  <span className="text-body-secondary">({opponent.formation})</span>
                </h2>
                <table className="table table-sm mb-0">
                  <tbody>
                    {opponent.onPitch.map((p, i) =>
                      p ? (
                        <tr key={i}>
                          <td className="text-body-secondary">{p.slot}</td>
                          <td>{name(p.pid)}</td>
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-xl-5">
            <section className="card h-100">
              <div className="card-body">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <h2 className="h6 mb-0 me-auto">Commentary</h2>
                  <div
                    className="btn-group btn-group-sm"
                    role="group"
                    aria-label="Commentary detail"
                    data-testid="feed-mode"
                  >
                    {(
                      [
                        [false, "Key moments"],
                        [true, "Full commentary"],
                      ] as const
                    ).map(([full, label]) => (
                      <button
                        key={label}
                        type="button"
                        className={`btn ${fullFeed === full ? "btn-secondary" : "btn-outline-secondary"}`}
                        aria-pressed={fullFeed === full}
                        onClick={() => {
                          setFullFeed(full);
                          rememberFullFeed(full);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul
                  className="list-unstyled small mb-0"
                  data-testid="live-feed"
                  style={{ maxHeight: 560, overflowY: "auto" }}
                >
                  {feedLines(feed, ctx, view.period)
                    .filter((l) => fullFeed || l.key)
                    .map((l, i) => {
                      const badge = BADGES[l.kind];
                      return (
                        <li
                          key={i}
                          className={`py-1 ${l.kind === "goal" ? "fw-semibold" : ""} ${l.kind === "period" ? "text-body-secondary fst-italic" : ""}`}
                        >
                          <span
                            className="text-body-secondary me-2 d-inline-block"
                            style={{ width: 42 }}
                          >
                            {l.minute}
                          </span>
                          {badge && <span className={`badge ${badge[1]} me-1`}>{badge[0]}</span>}
                          {l.text}
                        </li>
                      );
                    })}
                </ul>
              </div>
            </section>
          </div>
          <div className="col-xl-7">
            <Stats view={view} />
            <div className="row g-3">
              {view.teams.map((t, side) => (
                <div key={side} className="col-md-6">
                  <TeamCard team={t} name={name} date={view.date} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Scoreboard({
  view,
  feed,
  name,
  done,
}: {
  view: LiveMatchView;
  feed: readonly MatchEvent[];
  name: (pid: number) => string;
  done: boolean;
}) {
  const [home, away] = view.teams;
  const scorers = (side: 0 | 1) =>
    feed.flatMap((e) =>
      e.type === "goal" && e.side === side
        ? [`${name(e.pid)} ${minuteLabel(e.clock)}${e.penalty ? " (pen)" : ""}`]
        : [],
    );
  const clock = done
    ? "Full time"
    : view.clock === 0
      ? "Kick-off"
      : isHalfTime(view)
        ? "Half-time"
        : minuteLabel(view.clock, view.period);
  const side = (t: LiveTeamView, s: 0 | 1, align: "start" | "end") => (
    <div className={`text-${align} flex-fill`} style={{ minWidth: 0 }}>
      <div className={`d-flex align-items-center gap-2 fw-semibold justify-content-${align}`}>
        {align === "start" && <img src={crestUrl(t.team.code)} alt="" width={30} height={35} />}
        <span>{t.team.name}</span>
        {t.user && <span className="badge text-bg-primary">You</span>}
        {align === "end" && <img src={crestUrl(t.team.code)} alt="" width={30} height={35} />}
      </div>
      <div className="small text-body-secondary" data-testid={`scorers-${s}`}>
        {scorers(s).join(", ")}
      </div>
    </div>
  );
  return (
    <section className="card mb-3" data-testid="live-scoreboard">
      <div className="card-body d-flex align-items-start justify-content-center gap-4">
        {side(home, 0, "end")}
        <div className="text-center px-2">
          <div className="display-6 fw-bold text-nowrap" data-testid="live-score">
            {view.score[0]} – {view.score[1]}
          </div>
          {view.shootout && (
            <div className="small">
              pens {view.shootout[0]}–{view.shootout[1]}
            </div>
          )}
          <div className="small text-body-secondary" data-testid="live-clock">
            {clock}
          </div>
        </div>
        {side(away, 1, "start")}
      </div>
    </section>
  );
}

function Stats({ view }: { view: LiveMatchView }) {
  const [h, a] = [view.teams[0].stats, view.teams[1].stats];
  const pass = (s: LiveTeamView["stats"]) =>
    s.passes > 0 ? `${Math.round((100 * s.passesCompleted) / s.passes)}%` : "–";
  const rows: [string, string | number, string | number][] = [
    ["Possession", `${Math.round(h.possession * 100)}%`, `${Math.round(a.possession * 100)}%`],
    ["Shots", h.shots, a.shots],
    ["On target", h.shotsOnTarget, a.shotsOnTarget],
    ["Expected goals", h.xg.toFixed(2), a.xg.toFixed(2)],
    ["Pass accuracy", pass(h), pass(a)],
    ["Corners", h.corners, a.corners],
    ["Fouls", h.fouls, a.fouls],
    ["Yellow cards", h.yellowCards, a.yellowCards],
    ["Red cards", h.redCards, a.redCards],
  ];
  const homeShare = Math.round(h.possession * 100);
  return (
    <section className="card mb-3">
      <div className="card-body">
        <h2 className="h6">Stats</h2>
        <div className="progress mb-2" style={{ height: 8 }} aria-hidden="true">
          <div className="progress-bar" style={{ width: `${homeShare}%` }} />
          <div className="progress-bar bg-secondary" style={{ width: `${100 - homeShare}%` }} />
        </div>
        <table className="table table-sm small mb-0" data-testid="live-stats">
          <tbody>
            {rows.map(([label, hv, av]) => (
              <tr key={label}>
                <td className="text-end" style={{ width: "30%" }}>
                  {hv}
                </td>
                <td className="text-center text-body-secondary">{label}</td>
                <td style={{ width: "30%" }}>{av}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamCard({
  team,
  name,
  date,
}: {
  team: LiveTeamView;
  name: (pid: number) => string;
  date: string;
}) {
  const onPitch = team.onPitch.filter((p) => p !== null).length;
  return (
    <section
      className={`card ${team.user ? "border-primary" : ""}`}
      data-testid={team.user ? "my-team" : "their-team"}
    >
      <div className="card-body small">
        <h2 className="h6 d-flex justify-content-between">
          <span>{team.team.name}</span>
          <span className="text-body-secondary fw-normal">{team.formation}</span>
        </h2>
        <table className="table table-sm align-middle mb-2">
          <tbody>
            {team.onPitch.map((p, i) =>
              p ? (
                <tr key={i} data-testid="energy-row">
                  <td className="text-body-secondary" style={{ width: 36 }}>
                    {p.slot}
                  </td>
                  <td className="text-nowrap">
                    {name(p.pid)}
                    {p.booked && (
                      <span className="badge text-bg-warning ms-1" title="Booked">
                        Y
                      </span>
                    )}
                    {p.injured && (
                      <InjuryTag
                        injury={{ type: "Match injury", until: addDays(date, p.injuryDays) }}
                        today={date}
                      />
                    )}
                  </td>
                  <td style={{ width: "35%" }}>
                    <div
                      className="progress"
                      style={{ height: 6 }}
                      title={`Energy ${p.energy}%`}
                      aria-label={`Energy ${p.energy}%`}
                    >
                      <div
                        className={`progress-bar ${energyClass(p.energy)}`}
                        style={{ width: `${p.energy}%` }}
                      />
                    </div>
                  </td>
                  <td className="text-end text-body-secondary" style={{ width: 40 }}>
                    {p.energy}
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        {onPitch < 11 && <div className="text-danger mb-1">Down to {onPitch} players.</div>}
        <div className="text-body-secondary mb-1">
          Subs {team.subsUsed}/{team.subLimit} · windows {team.windowsUsed}/{team.windowLimit}
        </div>
        <div className="text-body-secondary">
          Bench: {team.bench.map((b) => `${name(b.pid)} (${b.position})`).join(", ") || "none"}
        </div>
      </div>
    </section>
  );
}

const PAUSE_TITLES: Record<LivePause["reason"], string> = {
  halfTime: "Half-time",
  extraTime: "Extra time to come",
  extraTimeBreak: "Extra time: half-time",
  injury: "Injury",
  redCard: "Sent off",
};

/**
 * The pause screen (SPEC §11): the live tactics board (T, 2026-10-21). The user's side as
 * the Tactics editor shows it, with energy and each player's match so far. Substitutions,
 * position moves (free), the formation and the sliders are previewed as he makes them and
 * made together with "Make changes": substitutions made together use one window during
 * play, none at a break.
 */
function ChangesPanel({
  view,
  pause,
  onApplied,
  onResume,
}: {
  view: LiveMatchView;
  pause: LivePause | null;
  onApplied: (view: LiveMatchView) => void;
  onResume: () => void;
}) {
  const { shell } = useShell();
  // The board as the match stands; `version` moves when it's fetched afresh (the editor restarts).
  const [board, setBoard] = useState<{ view: LiveBoardView; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    toWorker("getLiveBoard", shell.lid)
      .then((next) => {
        if (alive) setBoard((b) => ({ view: next, version: (b?.version ?? 0) + 1 }));
      })
      .catch((e: unknown) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [shell.lid, view.clock]);

  const name = (pid: number) => view.players[pid]?.name ?? `#${pid}`;
  const who = pause?.pid != null ? name(pause.pid) : "";
  const mine = view.teams[view.userSide];
  const keeperOff =
    pause?.reason === "redCard" && pause.pid !== null && view.players[pause.pid]?.position === "GK";
  const message =
    pause?.reason === "injury"
      ? `${who} is injured. Bring someone on, or he plays on at low energy.`
      : pause?.reason === "redCard"
        ? keeperOff
          ? `${who} has been sent off, and an outfielder has gone in goal. Bring on your reserve keeper for him if you have one.`
          : `${who} has been sent off: you're down to ${mine.onPitch.filter((p) => p !== null).length}. You can move a player into his empty slot; nobody can come on for him.`
        : pause?.reason === "extraTime"
          ? "Level after 90 minutes. Extra time adds a substitution and a window."
          : null;

  const current = board?.view;
  /** The changes that turn the line-up on the pitch into the one on the board. */
  const changesFor = (setup: TacticsSetup): LiveChanges => {
    if (!current) throw new GameError("The board is still loading.");
    const { changes, problem } = liveChanges(current.setup, setup);
    if (problem) throw new GameError(problem);
    return changes;
  };
  const saveText: SaveText = {
    label: (setup) => {
      const subs = current ? (liveChanges(current.setup, setup).changes.subs?.length ?? 0) : 0;
      return subs > 0
        ? `Make changes (${subs} substitution${subs === 1 ? "" : "s"})`
        : "Make changes";
    },
    done: "Done: your changes are made.",
    pending: "Not made yet",
    testId: "apply-changes",
  };

  return (
    <section
      className={`card mb-3 ${pause?.reason === "injury" || pause?.reason === "redCard" ? "border-danger" : "border-primary"}`}
      data-testid="changes"
    >
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-baseline gap-2 mb-2">
          <h2 className="h5 mb-0" data-testid="changes-title">
            {pause ? PAUSE_TITLES[pause.reason] : "Paused"}
          </h2>
          {current && (
            <span className="small text-body-secondary" data-testid="changes-rules">
              Your changes. Substitutions left: {current.subsLeft}.{" "}
              {current.free
                ? "This is a break, so substitutions now don't use a window."
                : current.windowsLeft > 0
                  ? `Substitutions now use 1 of your ${current.windowsLeft} remaining window${current.windowsLeft === 1 ? "" : "s"}: make them all together.`
                  : "No substitution windows left."}{" "}
              Moving players between positions is free.
            </span>
          )}
        </div>
        {message && (
          <div className="alert alert-warning py-2 small" data-testid="changes-message">
            {message}
          </div>
        )}
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        {!board ? (
          <p className="small text-body-secondary mb-0">Loading the board…</p>
        ) : (
          <LineupEditor
            key={board.version}
            initial={board.view}
            apply={(setup, mode) => {
              const changes = changesFor(setup);
              // A new formation from the menu: the game re-slots everyone by best fit.
              if (mode === "reslot") delete changes.slots;
              return toWorker("previewLiveChanges", shell.lid, changes);
            }}
            save={async (setup) => {
              const changes = changesFor(setup);
              onApplied(await toWorker("changeLiveMatch", shell.lid, changes, view.feedLength));
              const next = await toWorker("getLiveBoard", shell.lid);
              setBoard((b) => ({ view: next, version: b?.version ?? 0 }));
              return next;
            }}
            note="Drag a substitute onto a player to bring him on, or move players between positions. The team ratings show what your changes would do; nothing happens until you make them."
            baselineLabel="the line-up on the pitch"
            saveText={saveText}
            actions={(dirty) => (
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={onResume}
                data-testid="resume"
              >
                {dirty ? "Resume without these changes" : "Resume"}
              </button>
            )}
          />
        )}
      </div>
    </section>
  );
}
