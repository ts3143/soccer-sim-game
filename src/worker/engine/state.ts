/**
 * Match state: who is on the pitch, their energy and stats, each team's ratings and
 * "pickers" (weighted choices of who shoots, assists, fouls), the clock and the score.
 * Everything here is plain data plus the match's own random stream.
 */
import {
  formationById,
  formationsConfig,
  type FormationSlot,
} from "../../common/config/formations";
import { RATING_INDEX as R, type Position } from "../../common/config/ratings";
import type { SliderSettings } from "../../common/schema";
import type { Random } from "../core/random";
import type { Coefficients } from "./coefficients";
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
  Period,
  PlayerMatchStats,
  TeamMatchStats,
  TeamSide,
} from "./types";

export type Zone = "def" | "mid" | "att";
export type ChanceKind = "central" | "cross" | "dribble" | "longShot";
export type PickerKind =
  | "central"
  | "header"
  | "dribble"
  | "longShot"
  | "assistCentral"
  | "assistCross"
  | "fouler"
  | "fouled"
  | "passer"
  | "progressive"
  | "presser"
  | "midDefender"
  | "boxDefender"
  | "aerialDefender";
export const PICKER_KINDS: readonly PickerKind[] = [
  "central",
  "header",
  "dribble",
  "longShot",
  "assistCentral",
  "assistCross",
  "fouler",
  "fouled",
  "passer",
  "progressive",
  "presser",
  "midDefender",
  "boxDefender",
  "aerialDefender",
];

export interface PlayerState {
  input: EnginePlayer;
  side: TeamSide;
  /** Formation slot index while on the pitch; null on the bench or after leaving. */
  slot: number | null;
  energy: number;
  eff: number[];
  /** Match minute he came on (0 for starters); null if he never played. */
  onMinute: number | null;
  offMinute: number | null;
  booked: boolean;
  sentOff: boolean;
  /** Injured and waiting to be replaced (or already off). */
  injured: boolean;
  /** Passes attempted, accumulated as a share of each possession's passes (rounded at the end). */
  passShareAcc: number;
  /** Misplaced passes in kept possessions, accumulated the same way. */
  passFailAcc: number;
  passesFailed: number;
  /** This player's share of his team's passes while on the pitch. */
  passShare: number;
  stats: PlayerMatchStats;
}

/** Cumulative pick weights over the players on the pitch, for one kind of action. */
export interface Picker {
  players: PlayerState[];
  cumulative: number[];
}

export interface TeamState {
  side: TeamSide;
  input: EngineTeamInput;
  plan: FormationPlan;
  slots: (PlayerState | null)[];
  bench: PlayerState[];
  all: PlayerState[];
  sliders: SliderSettings;
  ratings: TeamRatings;
  /** Front players' long-ball target quality (aerial and pace) and the team's long passing. */
  longBall: number;
  setPieceTaker: PlayerState | null;
  penaltyTaker: PlayerState | null;
  pickers: Record<PickerKind, Picker>;
  /** Chance-type weights from the team's make-up (before directness). */
  chanceMix: Record<ChanceKind, number>;
  hotheadsOnPitch: number;
  stats: TeamMatchStats;
  possessionSeconds: number;
  subLimit: number;
  windowLimit: number;
  /** Clock times (seconds) of the AI's planned substitution windows. */
  subPlan: { first: number; second: number; late: number };
  nextAiCheck: number;
  /** Set when something forces a decision at the next stoppage (injury, red card). */
  needsAttention: boolean;
}

export interface MatchState {
  input: MatchInput;
  c: Coefficients;
  rng: Random;
  teams: [TeamState, TeamState];
  period: Period;
  /** Seconds since kick-off of the first half, by nominal period start (0, 45:00, 90:00, …). */
  clock: number;
  /** When the current period ends (seconds, including added time). */
  periodEnd: number;
  ball: TeamSide;
  zone: Zone;
  firstKickoff: TeamSide;
  score: [number, number];
  shootout: [number, number] | null;
  extraTime: boolean;
  feed: MatchEvent[];
  keyEvents: MatchEvent[];
  finished: boolean;
  inPlaySeconds: number;
  /** Feed events produced since the last stepMatch() call returned. */
  pending: MatchEvent[];
  /** Paused before kick-off or at a break: changes made now don't use a window. */
  atBreak: boolean;
  nextRefresh: number;
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const avg = (r: readonly number[], ...codes: (keyof typeof R)[]): number =>
  codes.reduce((s, code) => s + (r[R[code]] as number), 0) / codes.length;

/** Last minute of each period (for minutes played). */
export const PERIOD_CAP: Record<Period, number> = {
  first: 45,
  second: 90,
  extraFirst: 105,
  extraSecond: 120,
  penalties: 120,
};

export function currentMinute(s: MatchState): number {
  return Math.min(PERIOD_CAP[s.period], Math.floor(s.clock / 60));
}

export function emit(state: MatchState, event: MatchEvent, key: boolean): void {
  if (key) state.keyEvents.push(event);
  if (state.input.feed) {
    state.feed.push(event);
    state.pending.push(event);
  }
}

// ---------------------------------------------------------------------------
// Pickers: who acts

const POSITION_WEIGHTS: Record<PickerKind, Partial<Record<Position, number>>> = {
  central: { ST: 3.2, AM: 1.6, W: 1.5, WM: 0.8, CM: 0.8, DM: 0.35, WB: 0.35, FB: 0.25, CB: 0.2 },
  header: { ST: 2.5, CB: 1, W: 0.8, AM: 0.6, WM: 0.6, CM: 0.6, DM: 0.6, WB: 0.5, FB: 0.4 },
  dribble: { W: 2.5, AM: 2, ST: 2, WM: 1.4, CM: 0.7, WB: 0.6, FB: 0.4, DM: 0.3 },
  longShot: { CM: 2, AM: 2, W: 1.2, WM: 1.2, DM: 1, ST: 1, FB: 0.5, WB: 0.5, CB: 0.3 },
  assistCentral: { AM: 2.2, CM: 1.6, W: 1.5, WM: 1.2, ST: 1, WB: 0.8, FB: 0.7, DM: 0.7, CB: 0.25, GK: 0.05 },
  assistCross: { W: 2, WM: 2, WB: 2, FB: 1.6, AM: 0.8, CM: 0.6, ST: 0.4 },
  fouler: { DM: 1.6, CB: 1.3, CM: 1.2, FB: 1.1, WB: 1.1, WM: 0.9, ST: 0.8, AM: 0.7, W: 0.7, GK: 0.05 },
  fouled: { W: 1.8, AM: 1.6, ST: 1.5, WM: 1.3, CM: 1, WB: 0.9, FB: 0.7, DM: 0.7, CB: 0.4, GK: 0.1 },
  passer: { GK: 0.45, CB: 1.15, FB: 1, WB: 1, DM: 1.35, CM: 1.45, WM: 0.95, AM: 1.1, W: 0.8, ST: 0.55 },
  progressive: { CB: 0.9, FB: 0.9, WB: 1, DM: 1.3, CM: 1.4, WM: 1, AM: 1.2, W: 0.8, ST: 0.3, GK: 0.1 },
  presser: { ST: 1.3, W: 1.2, AM: 1.2, WM: 1, CM: 1, DM: 0.8, WB: 0.7, FB: 0.5, CB: 0.3 },
  midDefender: { DM: 1.6, CM: 1.3, CB: 1.1, FB: 1, WB: 1, WM: 0.8, AM: 0.5, W: 0.4, ST: 0.3 },
  boxDefender: { CB: 1.6, DM: 1.2, FB: 1, WB: 0.9, CM: 0.6, WM: 0.4, AM: 0.2, W: 0.2, ST: 0.2 },
  aerialDefender: { CB: 2, DM: 1, FB: 0.8, WB: 0.7, CM: 0.6, ST: 0.5, WM: 0.4, AM: 0.3, W: 0.3 },
}; // prettier-ignore

const SKILL: Record<PickerKind, (r: readonly number[]) => number> = {
  central: (r) => avg(r, "fin", "oiq"),
  header: (r) => avg(r, "hdr", "hgt", "jmp"),
  dribble: (r) => avg(r, "drb", "spd"),
  longShot: (r) => r[R.lsh] as number,
  assistCentral: (r) => avg(r, "spa", "oiq"),
  assistCross: (r) => r[R.crs] as number,
  fouler: (r) => avg(r, "tkl", "str"),
  fouled: (r) => avg(r, "drb", "spd"),
  passer: (r) => avg(r, "spa", "lpa"),
  progressive: (r) => avg(r, "spa", "lpa", "oiq"),
  presser: (r) => avg(r, "wrk", "ant", "tkl"),
  midDefender: (r) => avg(r, "tkl", "ant"),
  boxDefender: (r) => avg(r, "tkl", "diq"),
  aerialDefender: (r) => avg(r, "hdr", "jmp", "hgt"),
};

function buildPicker(team: TeamState, kind: PickerKind, c: Coefficients): Picker {
  const players: PlayerState[] = [];
  const cumulative: number[] = [];
  let total = 0;
  team.slots.forEach((p, i) => {
    if (!p) return;
    const slot = team.plan.formation.slots[i] as FormationSlot;
    let w = (POSITION_WEIGHTS[kind][slot.position] ?? 0) * (SKILL[kind](p.eff) / 50) ** 2;
    if (kind === "fouler") {
      if (p.input.hothead) w *= 2;
      if (p.booked) w *= c.cards.bookedFoulFactor;
    }
    if (w <= 0) return;
    total += w;
    players.push(p);
    cumulative.push(total);
  });
  return { players, cumulative };
}

export function pick(
  rng: Random,
  picker: Picker,
  exclude: PlayerState | null = null,
): PlayerState | null {
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
// Setup and refresh

function emptyPlayerStats(
  pid: number,
  side: TeamSide,
  slot: number | null,
  position: Position,
): PlayerMatchStats {
  return {
    pid,
    side,
    startedInSlot: slot,
    position,
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
    progressivePasses: 0,
    crosses: 0,
    tackles: 0,
    interceptions: 0,
    clearances: 0,
    blocks: 0,
    aerialsWon: 0,
    dribbles: 0,
    dribblesCompleted: 0,
    fouls: 0,
    foulsWon: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: 0,
    injuryDays: 0,
    energyEnd: 1,
    rating: 0,
  };
}

const emptyTeamStats = (): TeamMatchStats => ({
  goals: 0,
  shots: 0,
  shotsOnTarget: 0,
  xg: 0,
  passes: 0,
  passesCompleted: 0,
  possession: 0,
  possessions: 0,
  corners: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  penaltiesAwarded: 0,
  penaltiesScored: 0,
  subsUsed: 0,
  windowsUsed: 0,
  injuries: 0,
});

export function initTeam(
  input: EngineTeamInput,
  side: TeamSide,
  rng: Random,
  c: Coefficients,
): TeamState {
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
      booked: false,
      sentOff: false,
      injured: false,
      passShareAcc: 0,
      passFailAcc: 0,
      passesFailed: 0,
      passShare: 0,
      stats: emptyPlayerStats(
        pid,
        side,
        slot,
        slot === null ? "CM" : (formation.slots[slot] as FormationSlot).position,
      ),
    };
  };
  const slots = input.lineup.map((pid, i) => make(pid, i));
  const bench = input.bench.map((pid) => make(pid, null));
  const minute = (range: number[]) => 60 * rng.int(range[0] as number, range[1] as number);
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
    penaltyTaker: null,
    pickers: undefined as unknown as Record<PickerKind, Picker>,
    chanceMix: { central: 0, cross: 0, dribble: 0, longShot: 0 },
    hotheadsOnPitch: 0,
    stats: emptyTeamStats(),
    possessionSeconds: 0,
    subLimit: formationsConfig.maxSubstitutions,
    windowLimit: formationsConfig.substitutionWindows,
    subPlan: {
      first: minute(c.ai.firstWindow),
      second: minute(c.ai.secondWindow),
      late: minute(c.ai.lateWindow),
    },
    nextAiCheck: 55 * 60,
    needsAttention: false,
  };
  refreshTeam(team, c);
  return team;
}

export const onPitch = (team: TeamState): PlayerState[] =>
  team.slots.filter((p): p is PlayerState => p !== null);

/** Recomputes everything derived from who is on the pitch and their energy. */
export function refreshTeam(team: TeamState, c: Coefficients): void {
  const players = onPitch(team);
  for (const p of players) p.eff = effectiveRatings(p.input.ratings, p.energy, c);
  const best = (code: keyof typeof R, exclude?: (p: PlayerState) => boolean) =>
    players.reduce<PlayerState | null>(
      (top, p) =>
        exclude?.(p)
          ? top
          : !top || (p.eff[R[code]] as number) > (top.eff[R[code]] as number)
            ? p
            : top,
      null,
    );
  const isKeeper = (p: PlayerState) => team.plan.formation.slots[p.slot ?? 0]?.position === "GK";
  team.setPieceTaker = best("stp", isKeeper);
  team.penaltyTaker = best("pen", isKeeper);
  team.hotheadsOnPitch = players.filter((p) => p.input.hothead).length;
  team.ratings = computeTeamRatings(
    team.plan,
    team.slots.map((p) => (p ? { ratings: p.eff, foot: p.input.foot } : null)),
    team.setPieceTaker?.eff ?? null,
    team.sliders,
    c,
  );
  team.pickers = Object.fromEntries(
    PICKER_KINDS.map((k) => [k, buildPicker(team, k, c)]),
  ) as Record<PickerKind, Picker>;
  const total = (picker: Picker) => picker.cumulative[picker.cumulative.length - 1] ?? 0;
  // Each player's share of the team's passes (passes are spread deterministically).
  const passing = team.pickers.passer;
  const passTotal = total(passing);
  for (const p of players) p.passShare = 0;
  passing.players.forEach((p, i) => {
    const before = i === 0 ? 0 : (passing.cumulative[i - 1] as number);
    p.passShare = passTotal > 0 ? ((passing.cumulative[i] as number) - before) / passTotal : 0;
  });
  team.chanceMix = {
    central: c.chanceMix.central * Math.sqrt(total(team.pickers.assistCentral)),
    cross: c.chanceMix.cross * Math.sqrt(total(team.pickers.assistCross)),
    dribble: c.chanceMix.dribble * Math.sqrt(total(team.pickers.dribble)),
    longShot: c.chanceMix.longShot * Math.sqrt(total(team.pickers.longShot)),
  };
  const front = players.filter((p) => {
    const position = team.plan.formation.slots[p.slot ?? 0]?.position;
    return position === "ST" || position === "W" || position === "AM" || position === "WM";
  });
  const target = front.length
    ? front.reduce((s, p) => s + avg(p.eff, "hgt", "jmp", "hdr", "spd", "str"), 0) / front.length
    : 30;
  const passers =
    players.reduce((s, p) => s + (p.eff[R.lpa] as number), 0) / Math.max(1, players.length);
  team.longBall = 0.5 * target + 0.5 * passers;
}

export function initState(input: MatchInput, rng: Random, c: Coefficients): MatchState {
  const firstKickoff: TeamSide = rng.bool() ? 0 : 1;
  const added = rng.int(c.addedTime.firstHalf[0] as number, c.addedTime.firstHalf[1] as number);
  return {
    input,
    c,
    rng,
    teams: [initTeam(input.home, 0, rng, c), initTeam(input.away, 1, rng, c)],
    period: "first",
    clock: 0,
    periodEnd: 45 * 60 + added * 60,
    ball: firstKickoff,
    zone: "mid",
    firstKickoff,
    score: [0, 0],
    shootout: null,
    extraTime: false,
    feed: [],
    keyEvents: [],
    finished: false,
    inPlaySeconds: 0,
    pending: [],
    atBreak: true,
    nextRefresh: c.energy.refreshEvery,
  };
}
