/**
 * M2 Match lab (developer-only; the game's Watch live screen comes in M6): simulate a
 * match between any two clubs of the league, step through one possession by possession
 * with pause and resume, or simulate 1,000 matches and compare with the targets.
 */
import { useEffect, useRef, useState } from "react";
import type { ClubOverviewRow, LabBatch, LabLiveStart, LabMatch } from "../../common/api";
import type { MatchEvent, MatchResult, Period } from "../../common/match";
import { toWorker } from "../workerClient";
import { BoxScore } from "./BoxScore";
import { feedLine, minuteLabel } from "./matchText";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  lid: number;
  clubs: ClubOverviewRow[];
  leagues: { id: string; name: string }[];
}

interface Live {
  start: LabLiveStart;
  lines: string[];
  clock: number;
  period: Period;
  score: [number, number];
  finished: boolean;
  result: MatchResult | null;
  identical: boolean | null;
}

export function MatchLab({ lid, clubs, leagues }: Props) {
  const [homeCid, setHomeCid] = useState(clubs[0]?.cid ?? 0);
  const [awayCid, setAwayCid] = useState(clubs[1]?.cid ?? 1);
  const [seed, setSeed] = useState("lab-1");
  const [match, setMatch] = useState<LabMatch | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [playing, setPlaying] = useState(false);
  const [batch, setBatch] = useState<LabBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<Live | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const setup = { lid, homeCid, awayCid, seed };

  const simulate = async () => {
    setError(null);
    setLive(null);
    setPlaying(false);
    try {
      setMatch(await toWorker("simulateLabMatch", setup));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const watch = async () => {
    setError(null);
    setMatch(null);
    try {
      const start = await toWorker("startLabMatch", setup);
      setLive({
        start,
        lines: [],
        clock: 0,
        period: "first",
        score: [0, 0],
        finished: false,
        result: null,
        identical: null,
      });
      setPlaying(true);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const step = async (possessions: number) => {
    const current = liveRef.current;
    if (!current || current.finished || inFlight.current) return;
    inFlight.current = true;
    try {
      const update = await toWorker("stepLabMatch", current.start.id, possessions);
      const ctx = {
        name: (pid: number | null) =>
          pid === null ? "" : (current.start.players[pid]?.name ?? `#${pid}`),
        team: (side: 0 | 1) => (side === 0 ? current.start.home.abbr : current.start.away.abbr),
      };
      const next: Live = {
        ...current,
        clock: update.clock,
        period: update.period,
        score: update.score,
        finished: update.finished,
        result: update.result,
        identical: update.identicalToInstant,
      };
      const lines = update.events
        .map((event: MatchEvent) => feedLine(event, ctx, update.period))
        .filter((line): line is string => line !== null);
      next.lines = [...lines.reverse(), ...current.lines].slice(0, 400);
      liveRef.current = next;
      setLive(next);
      if (update.finished) setPlaying(false);
    } catch (e) {
      setError(errorText(e));
      setPlaying(false);
    } finally {
      inFlight.current = false;
    }
  };

  // Auto-play: one possession every 120 ms while playing.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => void step(1), 120);
    return () => clearInterval(timer);
  });

  const runBatch = async () => {
    setBusy(true);
    setError(null);
    try {
      setBatch(await toWorker("runLabBatch", lid, 1000));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const clubSelect = (id: string, value: number, onChange: (cid: number) => void) => (
    <select
      id={id}
      className="form-select"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {leagues.map((league) => (
        <optgroup key={league.id} label={league.name}>
          {clubs
            .filter((c) => c.leagueId === league.id)
            .map((c) => (
              <option key={c.cid} value={c.cid}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <>
      <section className="card mb-4">
        <div className="card-body">
          <h3 className="h6 text-uppercase text-body-secondary">One match</h3>
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label small mb-1" htmlFor="lab-home">
                Home
              </label>
              {clubSelect("lab-home", homeCid, setHomeCid)}
            </div>
            <div className="col-md-4">
              <label className="form-label small mb-1" htmlFor="lab-away">
                Away
              </label>
              {clubSelect("lab-away", awayCid, setAwayCid)}
            </div>
            <div className="col-md-2">
              <label className="form-label small mb-1" htmlFor="lab-seed">
                Seed
              </label>
              <input
                id="lab-seed"
                className="form-control"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </div>
            <div className="col-md-2 d-flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-fill"
                onClick={() => void simulate()}
              >
                Simulate
              </button>
              <button
                type="button"
                className="btn btn-outline-primary flex-fill"
                onClick={() => void watch()}
              >
                Watch
              </button>
            </div>
          </div>
          <p className="small text-body-secondary mt-2 mb-0">
            Same clubs and seed, same match. League matches use that league&apos;s style; the AI
            picks both teams&apos; tactics and makes their changes (a simulated match).
          </p>
          {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
        </div>
      </section>

      {live && (
        <section className="card mb-4">
          <div className="card-body">
            <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
              <div className="h4 mb-0">
                {live.start.home.name} {live.score[0]}–{live.score[1]} {live.start.away.name}
              </div>
              <span className="badge text-bg-secondary font-monospace">
                {live.finished ? "FT" : minuteLabel(live.clock, live.period)}
              </span>
              <div className="ms-auto d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={live.finished}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={live.finished || playing}
                  onClick={() => void step(1)}
                >
                  +1 possession
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={live.finished}
                  onClick={() => {
                    setPlaying(false);
                    void step(10_000);
                  }}
                >
                  To the end
                </button>
              </div>
            </div>
            {live.finished && live.identical !== null && (
              <div className={`alert ${live.identical ? "alert-success" : "alert-danger"} py-2`}>
                {live.identical
                  ? "✓ Stepped with pauses, this match is identical to an instant simulation with the same seed."
                  : "✗ The stepped match differs from an instant simulation: this is a bug."}
              </div>
            )}
            <div
              className="border rounded p-2 small font-monospace"
              style={{ maxHeight: 260, overflowY: "auto" }}
            >
              {live.lines.length === 0 ? (
                <div className="text-body-secondary">Kick-off…</div>
              ) : (
                live.lines.map((line, i) => <div key={live.lines.length - i}>{line}</div>)
              )}
            </div>
            {live.result && (
              <div className="mt-3">
                <BoxScore
                  home={live.start.home}
                  away={live.start.away}
                  players={live.start.players}
                  result={live.result}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {match && (
        <section className="card mb-4">
          <div className="card-body">
            <BoxScore
              home={match.home}
              away={match.away}
              players={match.players}
              result={match.result}
            />
          </div>
        </section>
      )}

      <section className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center gap-3 mb-2">
            <h3 className="h6 text-uppercase text-body-secondary mb-0">1,000 matches</h3>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={busy}
              onClick={() => void runBatch()}
            >
              {busy ? "Simulating…" : "Simulate 1,000 matches"}
            </button>
          </div>
          <p className="small text-body-secondary">
            Random pairs of clubs from the same league, league styles neutral, compared with the
            per-match calibration targets. Runs in your browser&apos;s game worker.
          </p>
          {batch && (
            <>
              <p className="small mb-2">
                {batch.matches.toLocaleString("en-GB")} matches,{" "}
                <strong>{batch.msPerMatch.toFixed(2)} ms per match</strong> in the browser (budget 5
                ms).
              </p>
              <div className="table-responsive">
                <table className="table table-sm small w-auto mb-0">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th className="text-end">Measured</th>
                      <th className="text-end">Target</th>
                      <th className="text-end">Band</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <tr key={row.metric}>
                        <td>{row.metric}</td>
                        <td className="text-end">
                          {row.value < 1 ? row.value.toFixed(3) : row.value.toFixed(2)}
                        </td>
                        <td className="text-end">{row.target}</td>
                        <td className="text-end">
                          {row.low}–{row.high}
                        </td>
                        <td className={row.pass ? "text-success" : "text-warning"}>
                          {row.pass ? "✓ in band" : "○ outside (small sample)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
