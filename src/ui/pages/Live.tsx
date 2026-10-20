/**
 * Watch live (M6, SPEC §11). Before kick-off: the line-up for this match only (the Tactics
 * editor, applied at once) and the opponent's XI. During the match: the score and clock
 * with the scorers, play and pause, a speed slider, the commentary, live stats, and both
 * teams' energy bars and benches. In-match changes and the half-time screen follow.
 */
import { useEffect, useRef, useState } from "react";
import type {
  LiveChanges,
  LiveMatchView,
  LivePause,
  LiveTeamView,
  TacticsView,
} from "../../common/api";
import { formationsConfig } from "../../common/config/formations";
import type { MatchEvent } from "../../common/match";
import { LineupEditor } from "../components/LineupEditor";
import { feedLine, minuteLabel, type FeedContext } from "../components/matchText";
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

type LineKind = "goal" | "yellow" | "red" | "sub" | "injury" | "period" | "other";

interface Line {
  clock: number;
  text: string;
  kind: LineKind;
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
    if (text) lines.push({ clock, text, kind: kindOf(event) });
  }
  return lines.reverse();
}

const isHalfTime = (view: LiveMatchView) =>
  view.atBreak && view.period === "second" && view.clock === 45 * 60;
const MVP_FORMATIONS = formationsConfig.formations.filter((f) => f.mvp).map((f) => f.id);

const energyClass = (e: number) => (e >= 70 ? "bg-success" : e >= 50 ? "bg-warning" : "bg-danger");

export function Live() {
  const { shell } = useShell();
  const [view, setView] = useState<LiveMatchView | null>(null);
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
          key={`${view.feedLength}/${view.teams[view.userSide].subsUsed}`}
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
          <div className="col-xxl-9">
            <h2 className="h5">Your line-up for this match</h2>
            <LineupEditor
              initial={lineup}
              apply={(setup, mode) => toWorker("setLiveLineup", shell.lid, setup, mode)}
              note="Changes here are for this match only: your saved Tactics stay as they are. Only players fit to play are listed."
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
                <h2 className="h6">Commentary</h2>
                <ul
                  className="list-unstyled small mb-0"
                  data-testid="live-feed"
                  style={{ maxHeight: 560, overflowY: "auto" }}
                >
                  {feedLines(feed, ctx, view.period).map((l, i) => {
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
                          {minuteLabel(l.clock)}
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
                  <TeamCard team={t} name={name} />
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

function TeamCard({ team, name }: { team: LiveTeamView; name: (pid: number) => string }) {
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
                    {p.injured && <span className="badge text-bg-danger ms-1">injured</span>}
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
 * The pause screen (SPEC §11): substitutions, formation and sliders for the user's club.
 * All substitutions made together use one window during play; at a break they're free.
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
  const mine = view.teams[view.userSide];
  const [subs, setSubs] = useState<Record<number, number>>({});
  const [formation, setFormation] = useState(mine.formation);
  const [sliders, setSliders] = useState(mine.sliders);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = (pid: number) => view.players[pid]?.name ?? `#${pid}`;
  const subsLeft = mine.subLimit - mine.subsUsed;
  const windowsLeft = mine.windowLimit - mine.windowsUsed;
  const free = view.atBreak;
  const canSub = subsLeft > 0 && (free || windowsLeft > 0);
  const chosen = Object.values(subs);
  const pending = Object.keys(subs).length;
  const changed =
    pending > 0 ||
    formation !== mine.formation ||
    JSON.stringify(sliders) !== JSON.stringify(mine.sliders);

  const apply = async () => {
    const changes: LiveChanges = {};
    if (pending > 0) {
      changes.subs = Object.entries(subs).map(([out, inPid]) => ({ outPid: Number(out), inPid }));
    }
    if (formation !== mine.formation) changes.formation = formation;
    if (JSON.stringify(sliders) !== JSON.stringify(mine.sliders)) changes.sliders = sliders;
    setSaving(true);
    setError(null);
    try {
      onApplied(await toWorker("changeLiveMatch", shell.lid, changes, view.feedLength));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const who = pause?.pid != null ? name(pause.pid) : "";
  const keeperOff =
    pause?.reason === "redCard" && pause.pid !== null && view.players[pause.pid]?.position === "GK";
  const message =
    pause?.reason === "injury"
      ? `${who} is injured. Bring someone on, or he plays on at low energy.`
      : pause?.reason === "redCard"
        ? keeperOff
          ? `${who} has been sent off, and an outfielder has gone in goal. Bring on your reserve keeper for him if you have one.`
          : `${who} has been sent off: you're down to ${mine.onPitch.filter((p) => p !== null).length}.`
        : pause?.reason === "extraTime"
          ? "Level after 90 minutes. Extra time adds a substitution and a window."
          : null;

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
          <span className="small text-body-secondary">
            Your changes. Substitutions left: {subsLeft}.{" "}
            {free
              ? "This is a break, so substitutions now don't use a window."
              : windowsLeft > 0
                ? `Substitutions now use 1 of your ${windowsLeft} remaining window${windowsLeft === 1 ? "" : "s"}: make them all together.`
                : "No substitution windows left."}
          </span>
        </div>
        {message && (
          <div className="alert alert-warning py-2 small" data-testid="changes-message">
            {message}
          </div>
        )}
        <div className="row g-3">
          <div className="col-lg-8">
            <table className="table table-sm small align-middle mb-0" data-testid="changes-subs">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>On the pitch</th>
                  <th className="text-end">Energy</th>
                  <th>Replace with</th>
                </tr>
              </thead>
              <tbody>
                {mine.onPitch.map((p, i) =>
                  p ? (
                    <tr key={i} className={p.pid === pause?.pid ? "table-danger" : ""}>
                      <td className="text-body-secondary">{p.slot}</td>
                      <td className="text-nowrap">
                        {name(p.pid)}
                        {p.booked && <span className="badge text-bg-warning ms-1">Y</span>}
                        {p.injured && <span className="badge text-bg-danger ms-1">injured</span>}
                      </td>
                      <td className={`text-end ${p.energy < 50 ? "text-danger" : ""}`}>
                        {p.energy}
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          aria-label={`Replace ${name(p.pid)}`}
                          value={subs[p.pid] ?? ""}
                          disabled={!canSub || (pending >= subsLeft && subs[p.pid] === undefined)}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSubs((current) => {
                              const next = { ...current };
                              if (value === "") delete next[p.pid];
                              else next[p.pid] = Number(value);
                              return next;
                            });
                          }}
                        >
                          <option value="">—</option>
                          {mine.bench
                            .filter((b) => b.pid === subs[p.pid] || !chosen.includes(b.pid))
                            .map((b) => (
                              <option key={b.pid} value={b.pid}>
                                {name(b.pid)} ({b.position}, {view.players[b.pid]?.ovr ?? "?"})
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <div className="col-lg-4">
            <label htmlFor="live-formation" className="form-label small fw-semibold mb-0">
              Formation
            </label>
            <select
              id="live-formation"
              className="form-select form-select-sm mb-3"
              value={formation}
              onChange={(e) => setFormation(e.target.value)}
            >
              {MVP_FORMATIONS.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
            {formationsConfig.sliders.map((s) => (
              <div key={s.key} className="mb-2">
                <label
                  htmlFor={`live-slider-${s.key}`}
                  className="form-label small fw-semibold text-capitalize mb-0"
                >
                  {s.key}{" "}
                  <span className="fw-normal text-body-secondary">
                    ({sliders[s.key] > 0 ? `+${sliders[s.key]}` : sliders[s.key]})
                  </span>
                </label>
                <input
                  id={`live-slider-${s.key}`}
                  type="range"
                  className="form-range"
                  min={-2}
                  max={2}
                  step={1}
                  value={sliders[s.key]}
                  onChange={(e) => setSliders({ ...sliders, [s.key]: Number(e.target.value) })}
                />
                <div className="d-flex justify-content-between small text-body-secondary">
                  <span>{s.low}</span>
                  <span>{s.high}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && <div className="alert alert-danger py-2 small mt-2">{error}</div>}
        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!changed || saving}
            onClick={() => void apply()}
            data-testid="apply-changes"
          >
            Make changes
            {pending > 0 ? ` (${pending} substitution${pending === 1 ? "" : "s"})` : ""}
          </button>
          <button type="button" className="btn btn-success" onClick={onResume} data-testid="resume">
            {changed ? "Resume without these changes" : "Resume"}
          </button>
        </div>
      </div>
    </section>
  );
}
