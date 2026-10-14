/**
 * The match engine's public API (SPEC §8): possession by possession, resumable at any
 * possession boundary. All randomness comes from the match's own seeded stream, so
 * pausing, resuming or stepping in different chunk sizes never changes the result.
 *
 *   const state = startMatch(input);
 *   while (!state.finished) stepMatch(state, 1);   // or stepMatch(state) to the end
 *   const result = matchResult(state);
 */
import { Random } from "../core/random";
import { COEFFICIENTS, type Coefficients } from "./coefficients";
import { addExtraTimeAllowance, manageStoppage, playMinutes, restAtBreak } from "./manager";
import { runPossession } from "./possession";
import { playShootout } from "./shootout";
import { emit, initState, onPitch, PERIOD_CAP, refreshTeam, type MatchState } from "./state";
import type {
  MatchEvent,
  MatchInput,
  MatchResult,
  Period,
  TeamMatchStats,
  TeamSide,
} from "./types";

export type { MatchState } from "./state";

const PERIOD_START: Record<Exclude<Period, "penalties">, number> = {
  first: 0,
  second: 45 * 60,
  extraFirst: 90 * 60,
  extraSecond: 105 * 60,
};
const HALF_TIME_RECOVERY = 0.04;
const BREAK_BEFORE_EXTRA_TIME = 0.02;

export function startMatch(
  input: MatchInput,
  coefficients: Coefficients = COEFFICIENTS,
): MatchState {
  const state = initState(input, Random.fromSeed(input.seed), coefficients);
  emit(state, { type: "kickoff", period: "first", clock: 0 }, false);
  return state;
}

/** Aggregate (or match) score from the home team's point of view. */
function tieScore(s: MatchState): [number, number] {
  const first = s.input.knockout?.firstLeg;
  return first ? [s.score[0] + first.home, s.score[1] + first.away] : [s.score[0], s.score[1]];
}

const other = (side: TeamSide): TeamSide => (side === 0 ? 1 : 0);

function beginPeriod(
  s: MatchState,
  period: Exclude<Period, "penalties">,
  addedMinutes: number,
  kickoff: TeamSide,
): void {
  s.period = period;
  s.clock = PERIOD_START[period];
  const length = period === "extraFirst" || period === "extraSecond" ? 15 : 45;
  s.periodEnd = PERIOD_START[period] + (length + addedMinutes) * 60;
  s.ball = kickoff;
  s.zone = "mid";
  emit(s, { type: "kickoff", period, clock: s.clock }, false);
}

function endPeriodIfDue(s: MatchState): void {
  if (s.clock < s.periodEnd) return;
  const { c, rng } = s;
  emit(s, { type: "periodEnd", period: s.period, clock: s.clock }, false);
  const ko = s.input.knockout;
  const [home, away] = tieScore(s);
  const level = home === away;

  if (s.period === "first") {
    restAtBreak(s, HALF_TIME_RECOVERY);
    manageStoppage(s, true); // half-time: substitutions don't use a window
    const added = rng.int(c.addedTime.secondHalf[0] as number, c.addedTime.secondHalf[1] as number);
    beginPeriod(s, "second", added, other(s.firstKickoff));
    return;
  }
  if (s.period === "second" && ko?.extraTime && level) {
    s.extraTime = true;
    for (const team of s.teams) addExtraTimeAllowance(team);
    restAtBreak(s, BREAK_BEFORE_EXTRA_TIME);
    manageStoppage(s, true); // before extra time: free
    beginPeriod(s, "extraFirst", rng.int(0, 1), rng.bool() ? 0 : 1);
    return;
  }
  if (s.period === "extraFirst") {
    manageStoppage(s, true); // extra-time half-time: free
    beginPeriod(s, "extraSecond", rng.int(0, 2), other(s.ball));
    return;
  }
  if ((s.period === "second" || s.period === "extraSecond") && ko?.penalties && level) {
    s.period = "penalties";
    emit(s, { type: "kickoff", period: "penalties", clock: s.clock }, false);
    s.shootout = playShootout(s);
  }
  s.finished = true;
}

/**
 * Plays up to `possessions` possessions (default: to the end) and returns the feed
 * events they produced (empty unless input.feed is on). Safe to call after the end.
 */
export function stepMatch(state: MatchState, possessions = Infinity): MatchEvent[] {
  for (let n = 0; n < possessions && !state.finished; n++) {
    const { inPlay, dead } = runPossession(state);
    state.clock += inPlay + dead;
    playMinutes(state, (inPlay + dead) / 60);
    if (state.clock >= state.nextRefresh) {
      for (const team of state.teams) refreshTeam(team, state.c);
      state.nextRefresh = state.clock + state.c.energy.refreshEvery;
    }
    manageStoppage(state, false);
    endPeriodIfDue(state);
  }
  const events = state.pending;
  state.pending = [];
  return events;
}

/** The match minute (1–90, 91+ in added time) for a clock value, for display. */
export function matchMinute(clock: number): number {
  return Math.floor(clock / 60) + 1;
}

export function matchResult(state: MatchState): MatchResult {
  if (!state.finished) throw new Error("matchResult: the match isn't finished");
  const totalPossession = state.teams[0].possessionSeconds + state.teams[1].possessionSeconds;
  const teamStats = state.teams.map((t) => ({
    ...t.stats,
    possession: totalPossession > 0 ? t.possessionSeconds / totalPossession : 0.5,
  })) as [TeamMatchStats, TeamMatchStats];
  const fullTime = PERIOD_CAP[state.extraTime ? "extraSecond" : "second"];
  const players = state.teams.flatMap((t) =>
    t.all
      .filter((p) => p.onMinute !== null)
      .map((p) => ({
        ...p.stats,
        minutes: Math.max(0, (p.offMinute ?? fullTime) - (p.onMinute ?? 0)),
        energyEnd: p.slot === null ? p.stats.energyEnd : p.energy,
      })),
  );

  let winner: TeamSide | null = null;
  if (state.input.knockout) {
    const [home, away] = tieScore(state);
    if (home !== away) winner = home > away ? 0 : 1;
    else if (state.shootout) winner = state.shootout[0] > state.shootout[1] ? 0 : 1;
  }
  return {
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    extraTime: state.extraTime,
    penalties: state.shootout ? `${state.shootout[0]}-${state.shootout[1]}` : null,
    winner,
    teams: teamStats,
    players,
    keyEvents: [...state.keyEvents],
    duration: state.clock,
  };
}

/** Runs a whole match headlessly. */
export function simulateMatch(
  input: MatchInput,
  coefficients: Coefficients = COEFFICIENTS,
): MatchResult {
  const state = startMatch(input, coefficients);
  stepMatch(state);
  return matchResult(state);
}

/** Players currently on the pitch for a side (for the live view). */
export const playersOnPitch = (state: MatchState, side: TeamSide) => onPitch(state.teams[side]);
