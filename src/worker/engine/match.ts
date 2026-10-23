/**
 * The match engine's public API (SPEC §8): possession by possession, resumable at any
 * possession boundary. All randomness comes from the match's own seeded stream, so
 * pausing, resuming or stepping in different chunk sizes never changes the result.
 *
 *   const state = startMatch(input);
 *   while (!state.finished) stepMatch(state, 1);   // or stepMatch(state) to the end
 *   const result = matchResult(state);
 */
import { formationById } from "../../common/config/formations";
import type { Position } from "../../common/config/ratings";
import type { SliderSettings } from "../../common/schema";
import { maximizeAssignment } from "../core/assignment";
import { rawPositionOvr, wrongFootPenalty } from "../core/ovr";
import { Random } from "../core/random";
import { COEFFICIENTS, type Coefficients } from "./coefficients";
import {
  addExtraTimeAllowance,
  manageStoppage,
  playMinutes,
  restAtBreak,
  substitute,
} from "./manager";
import { runPossession } from "./possession";
import { playShootout } from "./shootout";
import { manOfTheMatch, matchRating, winningSide } from "./ratings";
import {
  currentMinute,
  emit,
  initState,
  onPitch,
  PERIOD_CAP,
  refreshTeam,
  type MatchState,
  type PlayerState,
  type TeamState,
} from "./state";
import { formationPlan } from "./teamRatings";
import type {
  MatchEvent,
  MatchInput,
  MatchResult,
  Period,
  PlayerMatchStats,
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
  s.atBreak = true;
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
    state.atBreak = false;
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

const CLEAN_SHEET_POSITIONS: readonly Position[] = ["GK", "CB", "FB", "WB"];

/**
 * A player's stats up to `lastMinute` (full time, or now during a live match): minutes,
 * passes, clean sheet and energy worked out from the running totals. Rating left at 0.
 */
function statsAt(p: PlayerState, lastMinute: number): PlayerMatchStats {
  const minutes = Math.max(0, (p.offMinute ?? lastMinute) - (p.onMinute ?? 0));
  const passes = Math.round(p.passShareAcc);
  return {
    ...p.stats,
    minutes,
    xg: Math.round(p.stats.xg * 100) / 100,
    xa: Math.round(p.stats.xa * 100) / 100,
    psxgFaced: Math.round(p.stats.psxgFaced * 100) / 100,
    passes,
    passesCompleted: Math.max(0, passes - p.passesFailed - Math.round(p.passFailAcc)),
    cleanSheet:
      p.stats.goalsConceded === 0 &&
      minutes >= 60 &&
      CLEAN_SHEET_POSITIONS.includes(p.stats.position)
        ? 1
        : 0,
    energyEnd: Math.round((p.slot === null ? p.stats.energyEnd : p.energy) * 100) / 100,
  };
}

function outcome(state: MatchState, side: TeamSide): "win" | "draw" | "loss" {
  const own = state.score[side];
  const opp = state.score[side === 0 ? 1 : 0];
  return own > opp ? "win" : own < opp ? "loss" : "draw";
}

/**
 * A player's match rating so far (the live board): what he'd get if the rest of his match
 * were average for his position, at the current score. It starts near the centre, moves
 * with what he does, and at full time is his match rating. Null if he hasn't played.
 */
export function ratingSoFar(state: MatchState, p: PlayerState): number | null {
  if (p.onMinute === null) return null;
  const now = currentMinute(state);
  const result = outcome(state, p.side);
  if (p.slot === null) return matchRating(statsAt(p, now), result, state.c); // off: his match is over
  const end = Math.max(now, PERIOD_CAP[state.extraTime ? "extraSecond" : "second"]);
  return matchRating(statsAt(p, end), result, state.c, (end - now) / 90);
}

export function matchResult(state: MatchState): MatchResult {
  if (!state.finished) throw new Error("matchResult: the match isn't finished");
  const fullTime = PERIOD_CAP[state.extraTime ? "extraSecond" : "second"];
  const totalPossession = state.teams[0].possessionSeconds + state.teams[1].possessionSeconds;

  const players = state.teams.flatMap((t) =>
    t.all
      .filter((p) => p.onMinute !== null)
      .map((p) => {
        const stats = statsAt(p, fullTime);
        return { ...stats, rating: matchRating(stats, outcome(state, p.side), state.c) };
      }),
  );

  const teamStats = state.teams.map((t) => {
    const own = players.filter((p) => p.side === t.side);
    return {
      ...t.stats,
      xg: Math.round(t.stats.xg * 100) / 100,
      passes: own.reduce((sum, p) => sum + p.passes, 0),
      passesCompleted: own.reduce((sum, p) => sum + p.passesCompleted, 0),
      possession: totalPossession > 0 ? t.possessionSeconds / totalPossession : 0.5,
    };
  }) as [TeamMatchStats, TeamMatchStats];

  let winner: TeamSide | null = null;
  if (state.input.knockout) {
    const [home, away] = tieScore(state);
    if (home !== away) winner = home > away ? 0 : 1;
    else if (state.shootout) winner = state.shootout[0] > state.shootout[1] ? 0 : 1;
  }
  const score = { homeGoals: state.score[0], awayGoals: state.score[1], winner };
  return {
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    extraTime: state.extraTime,
    penalties: state.shootout ? `${state.shootout[0]}-${state.shootout[1]}` : null,
    winner,
    teams: teamStats,
    players,
    motm: manOfTheMatch(players, winningSide(score)),
    keyEvents: [...state.keyEvents],
    duration: state.clock,
  };
}

// ---------------------------------------------------------------------------
// Changes by the user, for the club he is managing in a watched match

export interface MatchChanges {
  subs?: { outPid: number; inPid: number }[];
  sliders?: Partial<SliderSettings>;
  /** Switch formation; the players on the pitch are re-slotted by best fit. */
  formation?: string;
  /**
   * Who plays where, after the subs and any formation change: a pid per slot, null for a
   * slot left empty (a team down to ten). Moving players around the pitch is free.
   */
  slots?: (number | null)[];
}

export class MatchChangeError extends Error {}

function reslot(team: TeamState, formationId: string): void {
  const formation = formationById(formationId);
  const players = onPitch(team);
  const scores = players.map((p) =>
    formation.slots.map(
      (slot) =>
        rawPositionOvr(p.eff, slot.position) -
        wrongFootPenalty(slot.position, slot.side, p.input.foot),
    ),
  );
  const slotOfPlayer = maximizeAssignment(scores);
  const slots: (PlayerState | null)[] = formation.slots.map(() => null);
  players.forEach((p, i) => {
    const slot = slotOfPlayer[i] as number;
    slots[slot] = p;
    p.slot = slot;
  });
  team.plan = formationPlan(formation);
  team.slots = slots;
}

/** Puts the players on the pitch into the given slots (T, 2026-10-21: moves are free). */
function arrange(team: TeamState, slots: readonly (number | null)[]): void {
  const players = onPitch(team);
  const byPid = new Map(players.map((p) => [p.input.pid, p]));
  const named = slots.filter((pid): pid is number => pid !== null);
  if (slots.length !== team.plan.formation.slots.length) {
    throw new MatchChangeError("Every slot of the formation needs a player or a gap");
  }
  const valid =
    named.length === players.length &&
    new Set(named).size === named.length &&
    named.every((pid) => byPid.has(pid));
  if (!valid) {
    throw new MatchChangeError("Only the players on the pitch can be moved, each to one slot");
  }
  team.slots = slots.map((pid, i) => {
    const p = pid === null ? null : (byPid.get(pid) as PlayerState);
    if (p) p.slot = i;
    return p;
  });
}

/**
 * Applies the user's changes at a pause (between possessions). Substitutions made before
 * kick-off or at a break are free; otherwise one call uses one window, however many
 * players come on. Moving players between slots is always free. Throws MatchChangeError
 * if a change breaks the rules (the state may then be part-changed: callers that must
 * stay whole apply changes to a copy).
 */
export function applyChanges(state: MatchState, side: TeamSide, changes: MatchChanges): void {
  if (state.finished) throw new MatchChangeError("The match is over");
  const nothing =
    (changes.subs ?? []).length === 0 &&
    !changes.formation &&
    !changes.slots &&
    Object.keys(changes.sliders ?? {}).length === 0;
  if (nothing) return;
  for (const value of Object.values(changes.sliders ?? {})) {
    if (!Number.isInteger(value) || value < -2 || value > 2) {
      throw new MatchChangeError("Sliders take whole steps from -2 to +2");
    }
  }
  const team = state.teams[side];
  const free = state.atBreak;
  const subs = changes.subs ?? [];
  const cameOn: PlayerState[] = [];
  if (subs.length > 0) {
    const left = team.subLimit - team.stats.subsUsed;
    if (subs.length > left) throw new MatchChangeError(`Only ${left} substitution(s) left`);
    if (!free && team.stats.windowsUsed >= team.windowLimit) {
      throw new MatchChangeError("No substitution windows left");
    }
    for (const { outPid, inPid } of subs) {
      const out = onPitch(team).find((p) => p.input.pid === outPid);
      const incoming = team.bench.find((p) => p.input.pid === inPid);
      if (!out) throw new MatchChangeError(`Player ${outPid} is not on the pitch`);
      if (!incoming) throw new MatchChangeError(`Player ${inPid} is not an available substitute`);
      substitute(state, team, out, incoming, out.injured ? "injury" : "manager");
      cameOn.push(incoming);
    }
    if (!free) team.stats.windowsUsed++;
  }
  if (changes.formation && changes.formation !== team.plan.formation.id)
    reslot(team, changes.formation);
  if (changes.slots) arrange(team, changes.slots);
  // A player who has just come on is judged against the slot he ends up in.
  for (const p of cameOn) {
    p.stats.position = team.plan.formation.slots[p.slot ?? 0]?.position ?? p.stats.position;
  }
  if (changes.sliders) team.sliders = { ...team.sliders, ...changes.sliders };
  refreshTeam(team, state.c);
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
