/**
 * Player development and squad turnover over a season (SPEC §5, §7.1, §7.2, §10.5):
 * - development updates on 1 January and 1 July, from the half-season just played;
 * - ceiling decay for 19–23-year-olds who hardly played;
 * - retirements (end of season) and free agents unsigned for a year moving on (1 July);
 * - youth intake, academy promotion or release, and the temporary squad top-up until
 *   M4's contracts and transfers (preseason);
 * - end-of-season awards.
 *
 * Everything works on plain in-memory rows (mutating the player objects it is given) so
 * the save (src/worker/league/game.ts) and the headless tools run exactly the same code.
 * Each decision draws from its own seeded stream, e.g. `${seed}/dev/${date}/${pid}`.
 */
import { isSenior } from "../../common/status";
import { addDays, exactAge } from "../../common/dates";
import type { ClubDefinition } from "../../common/config/clubs";
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { WorldConfig } from "../../common/config/worlds";
import { formationById } from "../../common/config/formations";
import type { Position } from "../../common/config/ratings";
import type {
  AwardRow,
  Club,
  ClubSeason,
  InboxMessage,
  Player,
  TransactionRow,
} from "../../common/schema";
import { coachingFactor, developHalfSeason, medicalFactor, youthFactor } from "../core/development";
import { bestXi } from "../core/lineup";
import { bestPosition, positionOvrs, secondaryPositions } from "../core/ovr";
import { CEILING_DECAY, estimatePotential, type PotentialClubContext } from "../core/potential";
import { Random } from "../core/random";
import { COEFFICIENTS } from "../engine/coefficients";
import { ratingCentre } from "../engine/ratings";
import { roundWage, WAGE_STEEPNESS, wageAgeFactor } from "../generate/contracts";
import { canSignFreeAgent, clubCap, payroll } from "../finance/softCap";
import { worldMix } from "../generate/identity";
import { generateAcademyPlayer } from "../generate/youth";
import { FREE_AGENT_CONTEXT } from "../generate/world";
import { playoffId, type SeasonOutcome, type SeasonState } from "./season";
import { returnLoans } from "../market/loans";
import { aiRenewals, expireContracts } from "../market/renewals";
import { resetForPreseason } from "./squads";
import { effectiveDials } from "../club/standing";
import { GameError } from "../../common/errors";
import { localBirthplace } from "../generate/birthplace";

/** Coefficients (provisional, tuned with the calibration harness). */
export const TURNOVER = {
  /**
   * performanceAdj per rating point above his position's rating centre (capped at ±0.15 by the
   * core). 0.12 since ratings were widened (T, 2026-10-21): the same boost as 0.15 was.
   */
  performancePerPoint: 0.12,
  /** POT is recomputed from career arcs below this age; from it, POT = OVR (as in ZenGM). */
  potArcsBelowAge: 29,
  /** Retirement chance by age (outfield); goalkeepers use age − gkShift. */
  retirement: {
    byAge: [
      [32, 0.02],
      [33, 0.08],
      [34, 0.18],
      [35, 0.35],
      [36, 0.55],
      [37, 0.75],
      [38, 0.9],
    ] as [number, number][],
    gkShift: 2,
    lowOvr: [
      [50, 1.6],
      [60, 1.25],
    ] as [number, number][],
    freeAgent: 2,
    /** Free agents this old who went a full season unsigned retire. */
    unsignedRetireFromAge: 30,
  },
  /** Free agents this young unsigned for 12 months leave the game (SPEC default B8). */
  youngFreeAgentMaxAge: 23,
  /** Youths per club per summer (quality: src/worker/generate/youth.ts). */
  youth: { min: 3, max: 6 },

  academy: {
    /** From this age on 1 July an academy player is promoted or released (by 19, SPEC §7.2). */
    decideFromAge: 18,
    /** Promote if POT reaches the club's XI level minus this. */
    promotePotBelowXi: 6,
    /** Or if OVR reaches the XI level minus this. */
    promoteOvrBelowXi: 12,
    /** Promote a 17-year-old early if POT is at least XI level plus this. */
    earlyPotAboveXi: 2,
    contractYears: 3,
  },
  /** AI clubs promote academy prospects up to this many seniors each summer. */
  topUpTo: 22,
};

export const AREA: Record<Position, "gk" | "def" | "mid" | "att"> = {
  GK: "gk", CB: "def", FB: "def", WB: "def", DM: "mid", CM: "mid", WM: "mid", AM: "att", W: "att", ST: "att",
}; // prettier-ignore

export interface LoopWorld {
  /** The save's world (SPEC §17.1): its clubs file, competitions and switches. */
  config: WorldConfig;
  clubs: Club[];
  players: Player[];
  /** Club reputation (0–100) for the season being set up. */
  reputation: Map<number, number>;
  /** The current season's club rows (money, hype, reputation), by club. */
  clubSeasons: Map<number, ClubSeason>;
  userCid: number;
  seed: string;
  nextPid: () => number;
  /** AI bids for the user's players, open until `expires` (at most one per player). */
  openBids?: { pid: number; fromCid: number; expires: string }[];
}

export type NewTransaction = Omit<TransactionRow, "xid">;
export type NewAward = Omit<AwardRow, "aid">;

export interface TurnoverLog {
  /** Players changed in place (to save). */
  changed: Set<number>;
  /** New players (youth intake). */
  added: Player[];
  transactions: NewTransaction[];
  /** Messages for the user's inbox. */
  messages: Omit<InboxMessage, "mid">[];
}

export const emptyLog = (): TurnoverLog => ({
  changed: new Set(),
  added: [],
  transactions: [],
  messages: [],
});
export const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const ratingsOf = (p: Player): number[] => p.ratingsHistory.at(-1)?.ratings ?? [];

function interpolate(points: readonly [number, number][], x: number): number {
  const [x0, y0] = points[0] as [number, number];
  if (x <= x0) return x < x0 ? 0 : y0;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    const [xa, ya] = points[i - 1] as [number, number];
    if (x <= x1) return ya + ((y1 - ya) * (x - xa)) / (x1 - xa);
  }
  return (points[points.length - 1] as [number, number])[1];
}

// ---------------------------------------------------------------------------
// Club context

export interface ClubContext {
  club: Club;
  seniors: Player[];
  academy: Player[];
  xi: number;
  level: number;
}

/** Per club: squads, best-XI level, and the average XI level of its league. */
export function clubContexts(world: LoopWorld): Map<number, ClubContext> {
  const out = new Map<number, ClubContext>();
  for (const club of world.clubs) {
    const own = world.players.filter((p) => p.cid === club.cid);
    const seniors = own.filter(isSenior);
    const academy = own.filter((p) => p.status === "academy");
    const pool = seniors.length >= 11 ? seniors : [...seniors, ...academy];
    const xi = pool.length >= 11 ? bestXi(pool, formationById(club.tactics.formation)).meanOvr : 50;
    out.set(club.cid, { club, seniors, academy, xi, level: xi });
  }
  const byLeague = new Map<string, number[]>();
  for (const ctx of out.values()) {
    byLeague.set(ctx.club.leagueId, [...(byLeague.get(ctx.club.leagueId) ?? []), ctx.xi]);
  }
  for (const ctx of out.values()) {
    const xis = byLeague.get(ctx.club.leagueId) ?? [ctx.xi];
    ctx.level = xis.reduce((a, b) => a + b, 0) / xis.length;
  }
  return out;
}

function potContext(ctx: ClubContext | undefined): PotentialClubContext {
  if (!ctx) return FREE_AGENT_CONTEXT;
  return {
    coachingDial: effectiveDials(ctx.club).coaching,
    medicalDial: effectiveDials(ctx.club).medical,
    youthDial: effectiveDials(ctx.club).youth,
    xiStrength: ctx.xi,
    levelStrength: ctx.level,
  };
}

export function updatePot(
  p: Player,
  date: string,
  ctx: ClubContext | undefined,
  seed: string,
): void {
  const age = exactAge(p.birthDate, date);
  p.pot =
    age >= TURNOVER.potArcsBelowAge
      ? p.ovr
      : estimatePotential(
          {
            ratings: ratingsOf(p),
            position: p.position,
            age,
            curve: p.hidden.curve,
            ceiling: p.hidden.ceiling,
            academy: p.status === "academy",
            club: potContext(ctx),
          },
          Random.fromSeed(`${seed}/pot/${date}/${p.pid}`),
        );
  const entry = p.ratingsHistory.at(-1);
  if (entry) entry.pot = p.pot;
}

/** Minutes a club had to give in (from, to]: 90 per match, 120 after extra time. */
function clubMinutes(state: SeasonState, cid: number, from: string, to: string): number {
  let total = 0;
  for (const f of state.fixtures) {
    if (!f.result || f.date <= from || f.date > to) continue;
    if (f.homeCid === cid || f.awayCid === cid) total += f.result.extraTime ? 120 : 90;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Development (1 January and 1 July)

/**
 * A half-season development update for every player not retired (SPEC §5.1, §5.3),
 * using his tally since the last update. On 1 July also applies ceiling decay and
 * starts a new season tally. Recomputes POT.
 */
export function developmentUpdate(
  world: LoopWorld,
  state: SeasonState,
  date: string,
  summer: boolean,
): Set<number> {
  const contexts = clubContexts(world);
  const changed = new Set<number>();
  const season = state.season;
  const halfStart = summer ? `${season + 1}-01-01` : `${season}-07-01`;
  const t = TURNOVER;
  const halfMinutes = new Map<number, number>();
  const seasonMinutes = new Map<number, number>();
  const memo = (map: Map<number, number>, cid: number, from: string) => {
    let v = map.get(cid);
    if (v === undefined) {
      v = clubMinutes(state, cid, from, date);
      map.set(cid, v);
    }
    return v;
  };
  for (const p of world.players) {
    if (p.status === "retired") continue;
    const ctx = p.cid === null ? undefined : contexts.get(p.cid);
    const club = ctx?.club;
    const tally = p.devTally ?? { minutes: 0, appearances: 0, ratingTotal: 0, seasonMinutes: 0 };
    const age = exactAge(p.birthDate, date);
    const available = club ? memo(halfMinutes, club.cid, addDays(halfStart, -1)) : 0;
    const share = available > 0 ? tally.minutes / available : 0;
    const performance =
      tally.appearances > 0
        ? (tally.ratingTotal / tally.appearances - ratingCentre(p.position, COEFFICIENTS)) *
          t.performancePerPoint
        : 0;
    const rng = Random.fromSeed(`${world.seed}/dev/${date}/${p.pid}`);
    const next = developHalfSeason(
      ratingsOf(p),
      {
        age,
        curve: p.hidden.curve,
        ceiling: p.hidden.ceiling,
        ovr: p.ovr,
        coaching: coachingFactor(club ? effectiveDials(club).coaching : 50),
        medical: medicalFactor(club ? effectiveDials(club).medical : 50),
        minutesShare: share,
        levelStrength: ctx?.level ?? 55,
        performanceAdj: performance,
        academyYouth:
          p.status === "academy" ? youthFactor(club ? effectiveDials(club).youth : 50) : null,
      },
      rng,
    ).map((r) => Math.round(r));

    const ovrs = positionOvrs(next);
    p.ovrs = ovrs;
    p.position = bestPosition(ovrs);
    p.secondaryPositions = secondaryPositions(ovrs, p.position);
    p.ovr = Math.max(...ovrs);
    p.hidden.ceiling = Math.max(p.hidden.ceiling, p.ovr);

    if (summer) {
      // Ceiling decay: a 19–23-year-old who played under ~15% of the season's minutes.
      const d = CEILING_DECAY;
      const seasonAvailable = club ? memo(seasonMinutes, club.cid, `${season}-06-30`) : 0;
      const seasonShare = seasonAvailable > 0 ? tally.seasonMinutes / seasonAvailable : 0;
      if (
        age >= d.fromAge &&
        age < d.toAge + 1 &&
        p.status !== "academy" &&
        seasonShare < d.belowShare
      ) {
        p.hidden.ceiling = Math.max(p.ovr, p.hidden.ceiling - rng.int(d.min, d.max));
      }
    }
    p.ratingsHistory.push({
      season: summer ? season + 1 : season,
      date,
      ratings: next,
      ovr: p.ovr,
      pot: p.ovr,
    });
    // POT from career arcs once a year (1 July); on 1 January it only rises to meet OVR.
    if (summer) updatePot(p, date, ctx, world.seed);
    else {
      p.pot = Math.max(p.pot, p.ovr);
      const entry = p.ratingsHistory.at(-1);
      if (entry) entry.pot = p.pot;
    }
    p.devTally = {
      minutes: 0,
      appearances: 0,
      ratingTotal: 0,
      seasonMinutes: summer ? 0 : tally.seasonMinutes,
    };
    changed.add(p.pid);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// End of season (1 June): retirements, free agents leaving the game

/** Retirements and departures at the end of `season` (SPEC §5.5, default B8). */
export function endOfSeasonTurnover(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const r = TURNOVER.retirement;
  for (const p of world.players) {
    if (p.status === "retired" || p.status === "academy") continue;
    const age = exactAge(p.birthDate, date);
    const effectiveAge = p.position === "GK" ? age - r.gkShift : age;
    let chance = interpolate(r.byAge, effectiveAge);
    for (const [below, factor] of r.lowOvr) {
      if (p.ovr < below) {
        chance *= factor;
        break;
      }
    }
    if (p.status === "freeAgent") chance *= r.freeAgent;
    if (!Random.fromSeed(`${world.seed}/retire/${season}/${p.pid}`).bool(Math.min(1, chance)))
      continue;
    retire(p, season, date, log);
  }
  return log;
}

function retire(p: Player, season: number, date: string, log: TurnoverLog): void {
  const cid = p.cid;
  p.status = "retired";
  p.retiredSeason = season;
  p.cid = null;
  p.contract = null;
  p.loan = null;
  log.changed.add(p.pid);
  log.transactions.push({
    season,
    date,
    type: "retirement",
    pids: [p.pid],
    cids: cid === null ? [] : [cid],
    names: [fullName(p)],
    fee: 0,
  });
}

/**
 * 1 July: free agents unsigned for 12 months move on (SPEC §5.5, default B8): 30 and over
 * retire, 23 and under leave the game. Logged as retirements.
 */
export function freeAgentDepartures(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const yearAgo = addDays(date, -365);
  for (const p of world.players) {
    if (p.status !== "freeAgent" || p.freeAgentSince === null || p.freeAgentSince > yearAgo)
      continue;
    const age = exactAge(p.birthDate, date);
    // "23 and under" when released: up to a year older now.
    if (
      age >= TURNOVER.retirement.unsignedRetireFromAge ||
      age <= TURNOVER.youngFreeAgentMaxAge + 1
    ) {
      retire(p, season - 1, date, log);
    }
  }
  return log;
}

// ---------------------------------------------------------------------------
// Preseason (1 July): contracts, youth intake, academy, squad top-up

/** A wage in line with the club's current scale for a player of this OVR and age. */
function wageFor(ctx: ClubContext, ovr: number, age: number, date: string): number {
  const weight = (o: number, a: number) =>
    Math.exp(WAGE_STEEPNESS * (o - ctx.xi)) * wageAgeFactor(a);
  const scales = ctx.seniors
    .filter((p) => p.contract)
    .map((p) => (p.contract?.wage ?? 0) / weight(p.ovr, exactAge(p.birthDate, date)))
    .sort((a, b) => a - b);
  const scale = scales[Math.floor(scales.length / 2)] ?? 100_000;
  return roundWage(scale * weight(ovr, age));
}

export function freeShirtNumber(world: LoopWorld, cid: number, from: number): number {
  const taken = new Set(
    world.players.filter((p) => p.cid === cid && p.status !== "retired").map((p) => p.shirtNumber),
  );
  let n = from;
  while (taken.has(n)) n++;
  return n;
}

/** 3–6 youths aged 15–16 per club, by Youth dial and reputation (SPEC §7.2). */
export function youthIntake(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const y = TURNOVER.youth;
  const contexts = clubContexts(world);
  for (const club of world.clubs) {
    const rng = Random.fromSeed(`${world.seed}/youth/${season}/${club.cid}`);
    const reputation = world.reputation.get(club.cid) ?? 50;
    const dial = effectiveDials(club).youth;
    const count = clamp(
      Math.round(
        y.min + ((y.max - y.min) * (0.5 * dial + 0.5 * reputation)) / 100 + rng.normal(0, 0.7),
      ),
      y.min,
      y.max,
    );
    for (let i = 0; i < count; i++) {
      const player = generateAcademyPlayer(
        rng,
        {
          cid: club.cid,
          country: club.country,
          leagueId: club.leagueId,
          reputation,
          youthDial: dial,
        },
        rng.bool(0.5) ? 15 : 16,
        world.nextPid(),
        season,
        date,
        worldMix(world.config),
      );
      player.shirtNumber = freeShirtNumber(world, club.cid, 36);
      player.birthplace = localBirthplace(world.seed, player, club) ?? player.birthplace;
      world.players.push(player);
      updatePot(player, date, contexts.get(club.cid), world.seed);
      log.added.push(player);
    }
  }
  return log;
}

function promote(p: Player, ctx: ClubContext, season: number, date: string, log: TurnoverLog) {
  const age = exactAge(p.birthDate, date);
  p.status = "club";
  p.contract = {
    wage: wageFor(ctx, p.ovr, age, date),
    expires: `${season + TURNOVER.academy.contractYears}-06-30`,
  };
  p.transfers.push({
    date,
    season,
    fromCid: ctx.club.cid,
    toCid: ctx.club.cid,
    fee: 0,
    type: "academyPromotion",
  });
  ctx.academy = ctx.academy.filter((x) => x !== p);
  ctx.seniors.push(p);
  log.changed.add(p.pid);
  log.transactions.push({
    season,
    date,
    type: "academyPromotion",
    pids: [p.pid],
    cids: [ctx.club.cid],
    names: [fullName(p), ctx.club.name],
    fee: 0,
  });
}

/** Releases an academy player to the free-agent pool (no contract, nothing owed). */
function releaseFromAcademy(
  p: Player,
  club: Club,
  season: number,
  date: string,
  log: TurnoverLog,
): void {
  p.status = "freeAgent";
  p.cid = null;
  p.contract = null;
  p.freeAgentSince = date;
  p.shirtNumber = null;
  p.transfers.push({ date, season, fromCid: club.cid, toCid: null, fee: 0, type: "release" });
  log.changed.add(p.pid);
  log.transactions.push({
    season,
    date,
    type: "release",
    pids: [p.pid],
    cids: [club.cid],
    names: [fullName(p), club.name],
    fee: 0,
  });
}

/**
 * Academy players who must move on (18+ on 1 July; by 19, SPEC §7.2) are promoted or
 * released; AI clubs also promote outstanding 17-year-olds early. The user decides for his
 * own academy (M6): only those he left undecided get this rule (T, 2026-10-19).
 */
export function academyDecisions(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const a = TURNOVER.academy;
  const maxSenior = world.config.competitions.rosterRules.maxSenior;
  for (const ctx of clubContexts(world).values()) {
    const candidates = [...ctx.academy].sort(
      (x, y) => y.pot - x.pot || y.ovr - x.ovr || x.pid - y.pid,
    );
    const ai = ctx.club.cid !== world.userCid;
    for (const p of candidates) {
      const age = exactAge(p.birthDate, date);
      const mustDecide = age >= a.decideFromAge;
      const outstanding = ai && age >= 17 && p.pot >= ctx.xi + a.earlyPotAboveXi;
      if (!mustDecide && !outstanding) continue;
      const good = p.pot >= ctx.xi - a.promotePotBelowXi || p.ovr >= ctx.xi - a.promoteOvrBelowXi;
      if ((good || outstanding) && ctx.seniors.length < maxSenior) {
        promote(p, ctx, season, date, log);
      } else if (mustDecide) {
        releaseFromAcademy(p, ctx.club, season, date, log);
      }
    }
  }
  return log;
}

/** The user promotes one of his academy players: his first pro contract (SPEC §7.2). */
export function promoteAcademyPlayer(
  world: LoopWorld,
  pid: number,
  season: number,
  date: string,
): TurnoverLog {
  const p = world.players.find((x) => x.pid === pid);
  const ctx = p?.cid == null ? undefined : clubContexts(world).get(p.cid);
  if (!p || !ctx || p.status !== "academy") throw new GameError("He isn't in an academy");
  const maxSenior = world.config.competitions.rosterRules.maxSenior;
  if (ctx.seniors.length >= maxSenior) {
    throw new GameError(`Your squad is full (${maxSenior} seniors): make room first`);
  }
  const log = emptyLog();
  promote(p, ctx, season, date, log);
  return log;
}

/** The user releases one of his academy players to the free-agent pool. */
export function releaseAcademyPlayer(
  world: LoopWorld,
  pid: number,
  season: number,
  date: string,
): TurnoverLog {
  const p = world.players.find((x) => x.pid === pid);
  const club = world.clubs.find((c) => c.cid === p?.cid);
  if (!p || !club || p.status !== "academy") throw new GameError("He isn't in an academy");
  const log = emptyLog();
  releaseFromAcademy(p, club, season, date, log);
  return log;
}

/** The wage a first pro contract would pay him at his club now. */
export function promotionWage(world: LoopWorld, p: Player, date: string): number {
  const ctx = p.cid == null ? undefined : clubContexts(world).get(p.cid);
  return ctx ? wageFor(ctx, p.ovr, exactAge(p.birthDate, date), date) : 0;
}

/** Academy players who'll be 18 or older on the coming 1 July: decided by then (SPEC §7.2). */
export function mustDecideBy(p: Player, julyFirst: string): boolean {
  return (
    p.status === "academy" && exactAge(p.birthDate, julyFirst) >= TURNOVER.academy.decideFromAge
  );
}

/**
 * 1 May: a reminder of the user's academy players he must promote by 1 July, or the AI
 * rule decides (promoted if good enough and there's room, otherwise released).
 */
export function academyReminder(
  world: LoopWorld,
  season: number,
  date: string,
): Omit<InboxMessage, "mid"> | null {
  const julyFirst = `${season + 1}-07-01`;
  const due = world.players
    .filter((p) => p.cid === world.userCid && mustDecideBy(p, julyFirst))
    .sort((a, b) => b.pot - a.pot || a.pid - b.pid);
  if (due.length === 0) return null;
  const list = due
    .map((p) => `${fullName(p)} (${p.position}, OVR ${p.ovr}, POT ${p.pot})`)
    .join(", ");
  return {
    date,
    season,
    kind: "contracts",
    subject: "Academy decisions due by 1 July",
    players: due.map((p) => ({ pid: p.pid, name: fullName(p) })),
    body: `These academy players will be 18 or older on 1 July: ${list}. Promote them on the Youth Academy page, or on 1 July the club decides for you: promoted if they're good enough and there's room in the squad, otherwise released.`,
    read: false,
  };
}

/**
 * 1 July: AI clubs below 22 seniors promote their best academy prospects (17+, by POT)
 * first. Signings to fill the rest come in the market (src/worker/market/aiMarket.ts),
 * which replaced M3's free-agent top-up in M4. The user's club is never topped up.
 */
export function promoteToSquadSize(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  for (const ctx of clubContexts(world).values()) {
    if (ctx.club.cid === world.userCid) continue;
    while (ctx.seniors.length < TURNOVER.topUpTo) {
      const prospect = [...ctx.academy]
        .filter((p) => p.status === "academy" && exactAge(p.birthDate, date) >= 17)
        .sort((x, y) => y.pot - x.pot || x.pid - y.pid)[0];
      if (!prospect) break;
      promote(prospect, ctx, season, date, log);
    }
  }
  return log;
}

/**
 * Free agency from 1 July where players move by trades (SPEC §17.6): there are no windows,
 * so AI clubs short of the squad size sign free agents, the club with the fewest seniors
 * first, one at a time: the best by OVR, plus the draft's need bonus for an area the club
 * is short in. Wages on the club's scale, 2 years (1 from 30); a club over its cap pays the
 * minimum wage. Its AI core until SL5, which adds the user's signings and the roster
 * deadline.
 */
export function freeAgencyTopUp(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const contexts = [...clubContexts(world).values()].filter((c) => c.club.cid !== world.userCid);
  const pool = world.players.filter((p) => p.status === "freeAgent");
  const pick = world.config.competitions.draft?.aiPick;
  for (;;) {
    const ctx = contexts
      .filter((c) => c.seniors.length < TURNOVER.topUpTo)
      .sort((a, b) => a.seniors.length - b.seniors.length || a.club.cid - b.club.cid)[0];
    if (!ctx || pool.length === 0) break;
    const have = { gk: 0, def: 0, mid: 0, att: 0 };
    for (const p of ctx.seniors) have[AREA[p.position]]++;
    const value = (p: Player) => {
      const area = AREA[p.position];
      return p.ovr + (pick ? pick.needBonus * Math.max(0, pick.areaTargets[area] - have[area]) : 0);
    };
    const best = pool.reduce((a, b) => (value(b) > value(a) ? b : a));
    pool.splice(pool.indexOf(best), 1);
    const age = exactAge(best.birthDate, date);
    // Over its cap (SPEC §17.7), a club signs free agents only at the minimum wage.
    const asked = wageFor(ctx, best.ovr, age, date);
    const softCap = world.config.competitions.softCap;
    const cap = clubCap(world.config.competitions, ctx.club, season);
    const fits =
      !softCap ||
      cap === null ||
      canSignFreeAgent(softCap, payroll(ctx.club, world.players, date), cap, asked);
    best.status = "club";
    best.cid = ctx.club.cid;
    best.freeAgentSince = null;
    best.contract = {
      wage: fits ? asked : (softCap?.minimumWage ?? asked),
      expires: `${season + (age >= 30 ? 1 : 2)}-06-30`,
    };
    best.shirtNumber = freeShirtNumber(world, ctx.club.cid, 30);
    best.transfers.push({
      date,
      season,
      fromCid: null,
      toCid: ctx.club.cid,
      fee: 0,
      type: "freeAgent",
    });
    ctx.seniors.push(best);
    log.changed.add(best.pid);
    log.transactions.push({
      season,
      date,
      type: "freeAgent",
      pids: [best.pid],
      cids: [ctx.club.cid],
      names: [fullName(best), ctx.club.name],
      fee: 0,
    });
  }
  return log;
}

/**
 * Every preseason step in order: loans returning, expiring contracts, free agents moving on, youth intake,
 * academy decisions, the AI's summer renewals, then AI academy promotions up to squad size.
 */
export function preseasonTurnover(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  // The youth intake and academy decisions only where clubs have academies (SPEC §17.4).
  const academies = world.config.switches.youth === "academy";
  const steps: ((w: LoopWorld, s: number, d: string) => Partial<TurnoverLog>)[] = [
    (w, s, d) => returnLoans(w, d, s),
    expireContracts,
    freeAgentDepartures,
    ...(academies ? [youthIntake, academyDecisions] : []),
    (w, s, d) => aiRenewals(w, s, d, "summer"),
    // Where players move by trades, free agency tops squads up from 1 July (SPEC §17.6).
    ...(world.config.switches.market === "trades" ? [freeAgencyTopUp] : []),
    promoteToSquadSize,
  ];
  for (const step of steps) {
    const part = step(world, season, date);
    for (const pid of part.changed ?? []) log.changed.add(pid);
    log.added.push(...(part.added ?? []));
    log.transactions.push(...(part.transactions ?? []));
    log.messages.push(...(part.messages ?? []));
  }
  return log;
}

/**
 * 1 July: the summer development update for the season just played, then the new
 * season's preseason steps and everyone back to full condition. The clubs must already
 * be in their new leagues (promotion and relegation applied).
 */
export function summerTransition(world: LoopWorld, played: SeasonState): TurnoverLog {
  const season = played.season + 1;
  const date = `${season}-07-01`;
  const log = emptyLog();
  for (const pid of developmentUpdate(world, played, date, true)) log.changed.add(pid);
  const pre = preseasonTurnover(world, season, date);
  for (const pid of pre.changed) log.changed.add(pid);
  log.added.push(...pre.added);
  log.transactions.push(...pre.transactions);
  log.messages.push(...pre.messages);
  for (const p of world.players) if (resetForPreseason(p, date)) log.changed.add(p.pid);
  return log;
}

// ---------------------------------------------------------------------------
// Awards (SPEC §10.5)

/** One player's league season, for awards. */
export interface SeasonLine {
  pid: number;
  cid: number;
  competition: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingTotal: number;
}

const TEAM_OF_THE_SEASON: Record<"gk" | "def" | "mid" | "att", number> = {
  gk: 1,
  def: 4,
  mid: 3,
  att: 3,
};
/** Player of the Year and Team of the Season need this share of the league's minutes. */
const AWARD_MIN_SHARE = { playerOfTheYear: 0.5, teamOfTheSeason: 0.4 };

/**
 * Season awards and honours: per league champions, Player of the Year, Golden Boot, Top
 * assists (T, 2026-10-25), Team of the Season, promotions and relegations; per cup the
 * winner; promotion play-off winners; where a play-off decides the title, the table
 * winner (recorded, not a title: SPEC §17.2).
 */
export function seasonAwards(
  state: SeasonState,
  outcome: SeasonOutcome,
  clubs: readonly Club[],
  players: readonly Player[],
  lines: readonly SeasonLine[],
  config: CompetitionsConfig,
): NewAward[] {
  const season = state.season;
  const clubName = new Map(clubs.map((c) => [c.cid, c.name]));
  const byPid = new Map(players.map((p) => [p.pid, p]));
  const awards: NewAward[] = [];
  const clubAward = (competition: string, type: string, cid: number) =>
    awards.push({ season, competition, type, pid: null, cid, name: clubName.get(cid) ?? "" });
  const playerAward = (competition: string, type: string, line: SeasonLine) =>
    awards.push({
      season,
      competition,
      type,
      pid: line.pid,
      cid: line.cid,
      name: byPid.get(line.pid) ? fullName(byPid.get(line.pid) as Player) : "",
    });

  for (const league of config.leagues) {
    const champion = outcome.champions[league.id];
    if (champion !== undefined) clubAward(league.id, "champions", champion);
    const leagueLines = lines.filter((l) => l.competition === league.id && l.appearances > 0);
    const full = 90 * league.rounds;
    const avg = (l: SeasonLine) => l.ratingTotal / l.appearances;
    const boot = [...leagueLines].sort(
      (a, b) => b.goals - a.goals || a.minutes - b.minutes || a.pid - b.pid,
    )[0];
    if (boot && boot.goals > 0) playerAward(league.id, "goldenBoot", boot);
    const provider = [...leagueLines].sort(
      (a, b) => b.assists - a.assists || a.minutes - b.minutes || a.pid - b.pid,
    )[0];
    if (provider && provider.assists > 0) playerAward(league.id, "topAssists", provider);
    const poty = leagueLines
      .filter((l) => l.minutes >= AWARD_MIN_SHARE.playerOfTheYear * full)
      .sort(
        (a, b) => avg(b) - avg(a) || b.goals + b.assists - (a.goals + a.assists) || a.pid - b.pid,
      )[0];
    if (poty) playerAward(league.id, "playerOfTheYear", poty);
    const eligible = leagueLines
      .filter((l) => l.minutes >= AWARD_MIN_SHARE.teamOfTheSeason * full)
      .sort((a, b) => avg(b) - avg(a) || a.pid - b.pid);
    for (const [area, count] of Object.entries(TEAM_OF_THE_SEASON)) {
      const picks = eligible.filter((l) => {
        const p = byPid.get(l.pid);
        return p && AREA[p.position] === area;
      });
      for (const line of picks.slice(0, count)) playerAward(league.id, "teamOfTheSeason", line);
    }
  }
  for (const move of outcome.moves) {
    clubAward(move.from, move.reason === "relegated" ? "relegated" : "promoted", move.cid);
  }
  // A title play-off's winner is the champion (above), not a play-off winner too.
  const titlePlayoffs = new Set(
    config.leagues.filter((l) => l.playoff?.decides === "title").map((l) => l.id),
  );
  for (const [leagueId, winners] of Object.entries(outcome.playoffWinners)) {
    if (titlePlayoffs.has(leagueId)) continue;
    for (const cid of winners) clubAward(playoffId(leagueId), "playoffWinner", cid);
  }
  for (const [leagueId, cid] of Object.entries(outcome.tableWinners ?? {})) {
    clubAward(leagueId, "tableWinner", cid);
  }
  for (const [cupId, cid] of Object.entries(outcome.cupWinners)) clubAward(cupId, "cupWinner", cid);
  return awards;
}

/** Clubs' reputation for the next season (unchanged until M4's board and finances). */
export function startingReputation(clubs: readonly ClubDefinition[]): Map<number, number> {
  return new Map(clubs.map((def, cid) => [cid, def.reputation]));
}
