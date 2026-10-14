/**
 * The match engine (SPEC §8): possession by possession, resumable at any possession
 * boundary. Each possession runs a chain (start zone → build-up → progression → chance
 * → shot with xG → outcome); team ratings set each step's odds, player ratings decide
 * who acts. All randomness comes from the match's own seeded stream, so pausing,
 * resuming or stepping in different chunk sizes never changes the result.
 *
 *   const state = startMatch(input);
 *   while (!state.finished) stepMatch(state, 1);   // or stepMatch(state) to the end
 *   const result = matchResult(state);
 */
import { formationById, type FormationSlot } from "../../common/config/formations";
import { RATING_INDEX as R, type Position } from "../../common/config/ratings";
import type { SliderSettings } from "../../common/schema";
import { Random } from "../core/random";
import { COEFFICIENTS, type Coefficients } from "./coefficients";
import {
  computeTeamRatings,
  effectiveRatings,
  formationPlan,
  type FormationPlan,
  type TeamRatings,
} from "./teamRatings";
import type {
  EnginePlayer,
  EngineTeamInput,
  MatchEvent,
  MatchInput,
  MatchResult,
  Period,
  PlayerMatchStats,
  ShotOutcome,
  ShotType,
  TeamMatchStats,
  TeamSide,
} from "./types";

type Zone = "def" | "mid" | "att";
type ChanceKind = "central" | "cross" | "dribble" | "longShot";

interface PlayerState {
  input: EnginePlayer;
  side: TeamSide;
  /** Formation slot index while on the pitch; null on the bench or after coming off. */
  slot: number | null;
  energy: number;
  eff: number[];
  /** Match minute he came on (0 for starters) and went off (null while on/never played). */
  onMinute: number | null;
  offMinute: number | null;
  stats: PlayerMatchStats;
}

/** Cumulative pick weights over the players on the pitch, for one kind of action. */
interface Picker {
  players: PlayerState[];
  cumulative: number[];
}

interface TeamState {
  side: TeamSide;
  input: EngineTeamInput;
  plan: FormationPlan;
  slots: (PlayerState | null)[];
  bench: PlayerState[];
  all: PlayerState[];
  sliders: SliderSettings;
  ratings: TeamRatings;
  /** Front players' long-ball target quality (aerial + speed) and the team's long passing. */
  longBall: number;
  setPieceTaker: PlayerState | null;
  pickers: Record<
    "central" | "header" | "dribble" | "longShot" | "assistCentral" | "assistCross",
    Picker
  >;
  /** Chance-type weights from the team's make-up (before directness). */
  chanceMix: Record<ChanceKind, number>;
  stats: TeamMatchStats;
  possessionSeconds: number;
}

export interface MatchState {
  input: MatchInput;
  c: Coefficients;
  rng: Random;
  teams: [TeamState, TeamState];
  period: Period;
  /** Seconds since the start of the current period's nominal start (0, 45:00, 90:00, …). */
  clock: number;
  /** When the current period ends (seconds, including added time). */
  periodEnd: number;
  ball: TeamSide;
  zone: Zone;
  firstKickoff: TeamSide;
  score: [number, number];
  /** All events when input.feed is on, else empty. */
  feed: MatchEvent[];
  keyEvents: MatchEvent[];
  finished: boolean;
  inPlaySeconds: number;
  /** Feed events produced since the last stepMatch() call returned. */
  pending: MatchEvent[];
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const PERIOD_START: Record<Exclude<Period, "penalties">, number> = {
  first: 0,
  second: 45 * 60,
  extraFirst: 90 * 60,
  extraSecond: 105 * 60,
};
const PERIOD_LENGTH = {
  first: 45 * 60,
  second: 45 * 60,
  extraFirst: 15 * 60,
  extraSecond: 15 * 60,
};

// ---------------------------------------------------------------------------
// Actor weights per position (who shoots, who assists), by chance kind.

const SHOOTER_WEIGHT: Record<"central" | "header" | "dribble" | "longShot", Partial<Record<Position, number>>> = {
  central: { ST: 3.2, AM: 1.6, W: 1.5, WM: 0.8, CM: 0.8, DM: 0.35, WB: 0.35, FB: 0.25, CB: 0.2 },
  header: { ST: 2.5, CB: 1, W: 0.8, AM: 0.6, WM: 0.6, CM: 0.6, DM: 0.6, WB: 0.5, FB: 0.4 },
  dribble: { W: 2.5, AM: 2, ST: 2, WM: 1.4, CM: 0.7, WB: 0.6, FB: 0.4, DM: 0.3 },
  longShot: { CM: 2, AM: 2, W: 1.2, WM: 1.2, DM: 1, ST: 1, FB: 0.5, WB: 0.5, CB: 0.3 },
}; // prettier-ignore
const ASSIST_WEIGHT: Record<"assistCentral" | "assistCross", Partial<Record<Position, number>>> = {
  assistCentral: { AM: 2.2, CM: 1.6, W: 1.5, WM: 1.2, ST: 1, WB: 0.8, FB: 0.7, DM: 0.7, CB: 0.25, GK: 0.05 },
  assistCross: { W: 2, WM: 2, WB: 2, FB: 1.6, AM: 0.8, CM: 0.6, ST: 0.4 },
}; // prettier-ignore

const avg = (r: readonly number[], ...codes: (keyof typeof R)[]) =>
  codes.reduce((s, code) => s + (r[R[code]] as number), 0) / codes.length;

const SKILL: Record<keyof TeamState["pickers"], (r: readonly number[]) => number> = {
  central: (r) => avg(r, "fin", "oiq"),
  header: (r) => avg(r, "hdr", "hgt", "jmp"),
  dribble: (r) => avg(r, "drb", "spd"),
  longShot: (r) => r[R.lsh] as number,
  assistCentral: (r) => avg(r, "spa", "oiq"),
  assistCross: (r) => r[R.crs] as number,
};

const POSITION_WEIGHTS: Record<keyof TeamState["pickers"], Partial<Record<Position, number>>> = {
  ...SHOOTER_WEIGHT,
  ...ASSIST_WEIGHT,
};

function buildPicker(team: TeamState, kind: keyof TeamState["pickers"]): Picker {
  const players: PlayerState[] = [];
  const cumulative: number[] = [];
  let total = 0;
  team.slots.forEach((p, i) => {
    if (!p) return;
    const slot = team.plan.formation.slots[i] as FormationSlot;
    const w = (POSITION_WEIGHTS[kind][slot.position] ?? 0) * (SKILL[kind](p.eff) / 50) ** 2;
    if (w <= 0) return;
    total += w;
    players.push(p);
    cumulative.push(total);
  });
  return { players, cumulative };
}

function pick(rng: Random, picker: Picker, exclude: PlayerState | null = null): PlayerState | null {
  const { players, cumulative } = picker;
  if (players.length === 0) return null;
  const total = cumulative[cumulative.length - 1] as number;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = rng.next() * total;
    let i = 0;
    while (i < cumulative.length - 1 && (cumulative[i] as number) <= r) i++;
    const chosen = players[i] as PlayerState;
    if (chosen !== exclude) return chosen;
  }
  return players.find((p) => p !== exclude) ?? null;
}

// ---------------------------------------------------------------------------
// Setup

function emptyPlayerStats(pid: number, side: TeamSide, slot: number | null): PlayerMatchStats {
  return {
    pid,
    side,
    startedInSlot: slot,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    xa: 0,
    passes: 0,
    passesCompleted: 0,
    keyPasses: 0,
  };
}

function initTeam(input: EngineTeamInput, side: TeamSide, c: Coefficients): TeamState {
  const formation = formationById(input.formation);
  if (input.lineup.length !== formation.slots.length) {
    throw new Error(
      `Team ${input.cid}: lineup has ${input.lineup.length} players for ${formation.id}`,
    );
  }
  const byPid = new Map(input.players.map((p) => [p.pid, p]));
  const make = (pid: number, slot: number | null): PlayerState => {
    const player = byPid.get(pid);
    if (!player) throw new Error(`Team ${input.cid}: player ${pid} is not in the squad`);
    const energy = clamp(player.condition / 100, 0, 1);
    return {
      input: player,
      side,
      slot,
      energy,
      eff: effectiveRatings(player.ratings, energy, c),
      onMinute: slot === null ? null : 0,
      offMinute: null,
      stats: emptyPlayerStats(pid, side, slot),
    };
  };
  const slots = input.lineup.map((pid, i) => make(pid, i));
  const bench = input.bench.map((pid) => make(pid, null));
  const team: TeamState = {
    side,
    input,
    plan: formationPlan(formation),
    slots,
    bench,
    all: [...slots, ...bench],
    sliders: { ...input.sliders },
    ratings: undefined as unknown as TeamRatings,
    longBall: 0,
    setPieceTaker: null,
    pickers: undefined as unknown as TeamState["pickers"],
    chanceMix: { central: 0, cross: 0, dribble: 0, longShot: 0 },
    stats: {
      goals: 0,
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
      passes: 0,
      possession: 0,
      possessions: 0,
    },
    possessionSeconds: 0,
  };
  refreshTeam(team, c);
  return team;
}

/** Recomputes everything derived from who is on the pitch and their energy. */
function refreshTeam(team: TeamState, c: Coefficients): void {
  const onPitch = team.slots.filter((p): p is PlayerState => p !== null);
  team.setPieceTaker = onPitch.reduce<PlayerState | null>(
    (best, p) => (!best || (p.eff[R.stp] as number) > (best.eff[R.stp] as number) ? p : best),
    null,
  );
  team.ratings = computeTeamRatings(
    team.plan,
    team.slots.map((p) => (p ? { ratings: p.eff, foot: p.input.foot } : null)),
    team.setPieceTaker?.eff ?? null,
    team.sliders,
    c,
  );
  team.pickers = {
    central: buildPicker(team, "central"),
    header: buildPicker(team, "header"),
    dribble: buildPicker(team, "dribble"),
    longShot: buildPicker(team, "longShot"),
    assistCentral: buildPicker(team, "assistCentral"),
    assistCross: buildPicker(team, "assistCross"),
  };
  const total = (picker: Picker) => picker.cumulative[picker.cumulative.length - 1] ?? 0;
  team.chanceMix = {
    central: c.chanceMix.central * Math.sqrt(total(team.pickers.assistCentral)),
    cross: c.chanceMix.cross * Math.sqrt(total(team.pickers.assistCross)),
    dribble: c.chanceMix.dribble * Math.sqrt(total(team.pickers.dribble)),
    longShot: c.chanceMix.longShot * Math.sqrt(total(team.pickers.longShot)),
  };
  // Long-ball outlet: the front players' aerial and pace, fed by long passing.
  const front = onPitch.filter((p) => {
    const position = team.plan.formation.slots[p.slot ?? 0]?.position;
    return position === "ST" || position === "W" || position === "AM" || position === "WM";
  });
  const target = front.length
    ? front.reduce((s, p) => s + avg(p.eff, "hgt", "jmp", "hdr", "spd", "str"), 0) / front.length
    : 30;
  const passers = onPitch.reduce((s, p) => s + (p.eff[R.lpa] as number), 0) / onPitch.length;
  team.longBall = 0.5 * target + 0.5 * passers;
}

export function startMatch(
  input: MatchInput,
  coefficients: Coefficients = COEFFICIENTS,
): MatchState {
  const rng = Random.fromSeed(input.seed);
  const c = coefficients;
  const firstKickoff: TeamSide = rng.bool() ? 0 : 1;
  const added = rng.int(c.addedTime.firstHalf[0] as number, c.addedTime.firstHalf[1] as number);
  const state: MatchState = {
    input,
    c,
    rng,
    teams: [initTeam(input.home, 0, c), initTeam(input.away, 1, c)],
    period: "first",
    clock: 0,
    periodEnd: PERIOD_LENGTH.first + added * 60,
    ball: firstKickoff,
    zone: "mid",
    firstKickoff,
    score: [0, 0],
    feed: [],
    keyEvents: [],
    finished: false,
    inPlaySeconds: 0,
    pending: [],
  };
  emit(state, { type: "kickoff", period: "first", clock: 0 }, false);
  return state;
}

function emit(state: MatchState, event: MatchEvent, key: boolean): void {
  if (key) state.keyEvents.push(event);
  if (state.input.feed) {
    state.feed.push(event);
    state.pending.push(event);
  }
}

// ---------------------------------------------------------------------------
// One possession

function startZoneFrom(rng: Random, shares: { def: number; mid: number; att: number }): Zone {
  const r = rng.next() * (shares.def + shares.mid + shares.att);
  if (r < shares.def) return "def";
  if (r < shares.def + shares.mid) return "mid";
  return "att";
}

function chooseChance(rng: Random, team: TeamState, c: Coefficients): ChanceKind {
  const mix = team.chanceMix;
  const cross = mix.cross * (1 + c.chanceMix.crossPerDirectness * team.sliders.directness);
  const total = mix.central + cross + mix.dribble + mix.longShot;
  const r = rng.next() * total;
  if (r < mix.central) return "central";
  if (r < mix.central + cross) return "cross";
  if (r < mix.central + cross + mix.dribble) return "dribble";
  return "longShot";
}

interface PossessionEnd {
  /** Who has the ball next, and where. */
  ball: TeamSide;
  zone: Zone;
  dead: number;
}

function runPossession(s: MatchState): void {
  const { c, rng } = s;
  const att = s.teams[s.ball];
  const defSide: TeamSide = s.ball === 0 ? 1 : 0;
  const def = s.teams[defSide];
  const A = att.ratings;
  const D = def.ratings;
  const k = c.slope / 10;
  const home = s.input.neutralVenue ? 0 : s.ball === 0 ? c.homeAdvantage : -c.homeAdvantage;
  const directness = att.sliders.directness;
  const timeScale = 1 - c.time.perDirectness * directness;
  let inPlay = 0;
  let zone = s.zone;
  let end: PossessionEnd | null = null;
  const lose = (shares: { def: number; mid: number; att: number }): PossessionEnd => ({
    ball: defSide,
    zone: startZoneFrom(rng, shares),
    dead: c.time.deadAfterTurnover,
  });

  att.stats.possessions++;

  if (zone === "def") {
    const longShare = clamp(
      c.buildUp.longBallShare + c.buildUp.longBallPerDirectness * directness,
      0.02,
      0.6,
    );
    if (rng.bool(longShare)) {
      inPlay += c.time.longBall;
      const p = sigmoid(
        c.buildUp.longBallBase +
          k * (att.longBall - D.defence) +
          home +
          c.sliders.pressingExposure * def.sliders.pressing,
      );
      if (rng.bool(p)) zone = rng.bool(c.buildUp.longBallToFinalThird) ? "att" : "mid";
      else end = lose(c.startZone.afterProgressionLoss);
    } else {
      inPlay += c.time.buildUp;
      const p = sigmoid(
        c.buildUp.base +
          k * (A.passing - D.pressing) +
          home -
          c.buildUp.shortBonusPerStep * directness,
      );
      if (rng.bool(p)) zone = "mid";
      else end = lose(c.startZone.afterBuildUpLoss);
    }
  }

  if (!end && zone === "mid") {
    inPlay += c.time.progression;
    const p = sigmoid(c.progression.base + k * (A.passing - D.defence) + home);
    if (rng.bool(p)) zone = "att";
    else end = lose(c.startZone.afterProgressionLoss);
  }

  // Chance creation; a blocked shot can fall back to the attackers for another go.
  for (let attempt = 0; !end && zone === "att" && attempt < 3; attempt++) {
    inPlay += attempt === 0 ? c.time.chance : c.time.failedPhase;
    const p = sigmoid(c.chance.base + k * (A.attack - D.defence) + home);
    if (!rng.bool(p)) {
      end = lose(c.startZone.afterChanceLoss);
      break;
    }
    const outcome = shoot(s, att, def, chooseChance(rng, att, c));
    if (outcome === "goal") {
      end = { ball: defSide, zone: "mid", dead: c.time.deadAfterGoal };
    } else if (outcome === "saved") {
      end = { ball: defSide, zone: "def", dead: c.time.deadAfterSave };
    } else if (outcome === "off") {
      end = { ball: defSide, zone: "def", dead: c.time.deadAfterShotOff };
    } else if (!rng.bool(c.chance.reboundRetained)) {
      end = { ball: defSide, zone: rng.bool(0.6) ? "def" : "mid", dead: c.time.deadAfterTurnover };
    }
  }
  end ??= lose(c.startZone.afterChanceLoss);

  const seconds = inPlay * timeScale;
  att.possessionSeconds += seconds;
  att.stats.passes += Math.max(1, Math.round(seconds / (c.time.secondsPerPass * timeScale)));
  s.inPlaySeconds += seconds;
  s.clock += seconds + end.dead;
  s.ball = end.ball;
  s.zone = end.zone;
}

function lognormalMeanOne(rng: Random, spread: number): number {
  return Math.exp(spread * rng.normal() - (spread * spread) / 2);
}

function shoot(s: MatchState, att: TeamState, def: TeamState, kind: ChanceKind): ShotOutcome {
  const { c, rng } = s;
  const shotType: ShotType = kind === "cross" ? "header" : kind;
  const shooter = pick(rng, att.pickers[kind === "cross" ? "header" : kind]);
  if (!shooter) return "off";

  let assister: PlayerState | null = null;
  if (kind === "cross") assister = pick(rng, att.pickers.assistCross, shooter);
  else if (kind === "central") assister = pick(rng, att.pickers.assistCentral, shooter);
  else if (kind === "longShot" && rng.bool(0.4))
    assister = pick(rng, att.pickers.assistCentral, shooter);
  else if (kind === "dribble" && rng.bool(0.3))
    assister = pick(rng, att.pickers.assistCentral, shooter);

  const skill =
    kind === "cross"
      ? avg(shooter.eff, "hdr", "jmp")
      : kind === "longShot"
        ? (shooter.eff[R.lsh] as number)
        : (shooter.eff[R.fin] as number);
  const base = kind === "cross" ? c.xg.header : c.xg[kind];
  const xg = clamp(
    base *
      lognormalMeanOne(rng, c.xg.spread) *
      Math.exp((-c.xg.pressure * (def.ratings.defence - att.ratings.attack)) / 10) *
      Math.exp((c.xg.shooter * (skill - 60)) / 10) *
      s.input.style.chanceQuality,
    c.xg.min,
    c.xg.max,
  );
  const pGoal = clamp(
    xg * Math.exp((-c.keeper.k * (def.ratings.goalkeeping - c.keeper.reference)) / 10),
    0.005,
    0.95,
  );

  let outcome: ShotOutcome;
  if (rng.bool(pGoal)) {
    outcome = "goal";
  } else {
    const blocked = clamp(
      (c.shotOutcome.blocked + (kind === "longShot" ? c.shotOutcome.longShotBlockedBonus : 0)) *
        (kind === "cross" ? c.shotOutcome.headerBlockedFactor : 1),
      0,
      0.9,
    );
    const r = rng.next();
    outcome =
      r < c.shotOutcome.saved ? "saved" : r < c.shotOutcome.saved + blocked ? "blocked" : "off";
  }

  shooter.stats.shots++;
  shooter.stats.xg += xg;
  att.stats.shots++;
  att.stats.xg += xg;
  if (assister) {
    assister.stats.keyPasses++;
    assister.stats.xa += xg;
  }
  if (outcome === "goal" || outcome === "saved") {
    shooter.stats.shotsOnTarget++;
    att.stats.shotsOnTarget++;
  }
  const clock = s.clock;
  emit(
    s,
    {
      type: "shot",
      clock,
      side: att.side,
      pid: shooter.input.pid,
      assistPid: assister?.input.pid ?? null,
      shotType,
      xg,
      outcome,
    },
    false,
  );
  if (outcome === "goal") {
    shooter.stats.goals++;
    att.stats.goals++;
    s.score[att.side]++;
    if (assister) assister.stats.assists++;
    emit(
      s,
      {
        type: "goal",
        clock,
        side: att.side,
        pid: shooter.input.pid,
        assistPid: assister?.input.pid ?? null,
        penalty: false,
      },
      true,
    );
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Periods and the public API

function endPeriodIfDue(s: MatchState): void {
  if (s.clock < s.periodEnd) return;
  emit(s, { type: "periodEnd", period: s.period, clock: s.clock }, false);
  if (s.period === "first") {
    const added = s.rng.int(
      s.c.addedTime.secondHalf[0] as number,
      s.c.addedTime.secondHalf[1] as number,
    );
    s.period = "second";
    s.clock = PERIOD_START.second;
    s.periodEnd = PERIOD_START.second + PERIOD_LENGTH.second + added * 60;
    s.ball = s.firstKickoff === 0 ? 1 : 0;
    s.zone = "mid";
    emit(s, { type: "kickoff", period: "second", clock: s.clock }, false);
    return;
  }
  s.finished = true;
}

/**
 * Plays up to `possessions` possessions (default: to the end) and returns the feed
 * events they produced (empty unless input.feed is on). Safe to call after the end.
 */
export function stepMatch(state: MatchState, possessions = Infinity): MatchEvent[] {
  for (let n = 0; n < possessions && !state.finished; n++) {
    runPossession(state);
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
  const players = state.teams.flatMap((t) =>
    t.all
      .filter((p) => p.onMinute !== null)
      .map((p) => ({ ...p.stats, minutes: (p.offMinute ?? 90) - (p.onMinute ?? 0) })),
  );
  return {
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    extraTime: false,
    penalties: null,
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
