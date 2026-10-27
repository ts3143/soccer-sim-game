/**
 * Squads between matches (SPEC §8.4, §9): condition and recovery, injuries, how much a
 * match matters to a club, and the AI's matchday squad.
 *
 * Condition is stored with the date it was set (a player's last match) and recovers
 * with rest from then on, so only players who play are ever rewritten. Today's value:
 *   condition = 100 − (100 − stored) × exp(−rate × days since)
 * with `rate` higher for good endurance and a high Medical dial, lower past 29.
 *
 * The AI picks its XI by slot OVR minus penalties (SPEC §9: OVR × condition, with a
 * mid-term view):
 * - tiredness: points of condition below 100, weighted down in big matches and up when
 *   a bigger match follows within a few days (fixture congestion);
 * - rest: in matches that matter less than an ordinary league match (early cup rounds,
 *   nothing to play for), the club's regular starters give way to fringe players.
 * The same AI picks the user's club in simulated matches, starting from his saved
 * line-up: his XI are its regulars and his bench comes first (SPEC §8.3; T, 2026-10-25).
 */
import { applyDiscipline, isSuspended } from "./discipline";
import { isSenior } from "../../common/status";
import { addDays, ageOn, exactAge } from "../../common/dates";
import type { CompetitionsConfig } from "../../common/config/competitions";
import { formationById } from "../../common/config/formations";
import { RATING_INDEX, type Position } from "../../common/config/ratings";
import type { MatchResult, PlayerMatchStats } from "../../common/match";
import type { Club, Fixture, InjuryRecord, Player, SavedLineup } from "../../common/schema";
import { maximizeAssignment } from "../core/assignment";
import { Random } from "../core/random";
import { slotOvr } from "../core/ovr";
import { effectiveDials } from "../club/standing";
import { aiSliders } from "../engine/aiTactics";
import { COEFFICIENTS, type Coefficients } from "../engine/coefficients";
import { drawInjuryDays } from "../engine/manager";
import { simulateMatch } from "../engine/match";
import { enginePlayer } from "../engine/prepare";
import type { EngineTeamInput } from "../engine/types";
import type { TableRow } from "../schedule/standings";
import { SQUAD_COEFFICIENTS, type SquadCoefficients } from "./coefficients";
import { leagueTableOf, playoffId, type PlayFixture, type SeasonState } from "./season";

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const AREA: Record<Position, "gk" | "def" | "mid" | "att"> = {
  GK: "gk", CB: "def", FB: "def", WB: "def", DM: "mid", CM: "mid", WM: "mid", AM: "att", W: "att", ST: "att",
}; // prettier-ignore
const BENCH_MINIMUM = { gk: 1, def: 2, mid: 2, att: 2 };
const BENCH_SIZE = 9;
const MATCHDAY_SQUAD = 20;

const currentRatings = (p: Player): number[] => p.ratingsHistory.at(-1)?.ratings ?? [];

/** Today's condition: the stored value plus recovery for the days since it was set. */
export function currentCondition(
  p: Player,
  date: string,
  medicalDial: number,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): number {
  const since = p.conditionDate;
  if (!since || p.condition >= 100) return 100;
  const days = daysBetween(since, date);
  if (days <= 0) return p.condition;
  const r = c.recovery;
  const endurance = currentRatings(p)[RATING_INDEX.end] ?? 50;
  const age = exactAge(p.birthDate, date);
  const ageFactor = Math.max(r.ageFloor, 1 - r.perYearOlder * Math.max(0, age - r.slowerFromAge));
  const rate =
    r.perDay *
    (r.enduranceBase + (r.enduranceSpan * endurance) / 100) *
    (r.medicalBase + (r.medicalSpan * medicalDial) / 100) *
    ageFactor;
  return 100 - (100 - p.condition) * Math.exp(-rate * days);
}

/** True if the player is still injured on `date` (fit again on `until`). */
export const isInjured = (p: Player, date: string): boolean =>
  p.injury !== null && p.injury.until > date;

/** Injury name by length (shown on the Injuries page from M5). */
export function injuryType(days: number): string {
  if (days < 7) return "Knock";
  if (days <= 21) return "Muscle strain";
  if (days <= 84) return "Ligament injury";
  return "Serious injury";
}

/** Sets a new injury and adds it to his history (T, 2026-10-25). */
function injure(p: Player, record: InjuryRecord): void {
  p.injury = { type: record.type, until: addDays(record.date, record.days) };
  (p.injuries ??= []).push(record);
}

/**
 * Updates a player after a match: condition from his energy at the end, any injury (with
 * the fixture and the opponent, for his history), and his development tally.
 */
export function applyMatch(
  p: Player,
  stats: PlayerMatchStats,
  fixture: Pick<Fixture, "fid" | "date" | "homeCid" | "awayCid">,
): void {
  const date = fixture.date;
  p.condition = Math.round(stats.energyEnd * 1000) / 10;
  p.conditionDate = date;
  const tally = p.devTally ?? { minutes: 0, appearances: 0, ratingTotal: 0, seasonMinutes: 0 };
  p.devTally = {
    minutes: tally.minutes + stats.minutes,
    appearances: tally.appearances + 1,
    ratingTotal: tally.ratingTotal + stats.rating,
    seasonMinutes: tally.seasonMinutes + stats.minutes,
  };
  if (stats.injuryDays > 0) {
    injure(p, {
      date,
      type: injuryType(stats.injuryDays),
      days: stats.injuryDays,
      fid: fixture.fid,
      opponentCid: stats.side === 0 ? fixture.awayCid : fixture.homeCid,
    });
  } else if (p.injury && p.injury.until <= date) {
    p.injury = null;
  }
}

/** Preseason (1 July): everyone back to full condition; injuries carry on. */
export function resetForPreseason(p: Player, date: string): boolean {
  const changed = p.condition !== 100 || (p.conditionDate ?? null) !== null;
  p.condition = 100;
  p.conditionDate = null;
  if (p.injury && p.injury.until <= date) {
    p.injury = null;
    return true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Training injuries

export interface Injured {
  pid: number;
  date: string;
  days: number;
}

/**
 * Training injuries on each day in (from, to] (SPEC §8.4): one draw per fit player per
 * day, in player-ID order, from that day's own random stream. So the result for a day
 * never depends on how the days were grouped into Play actions.
 */
export function trainingInjuries(
  clubs: readonly Club[],
  players: readonly Player[],
  from: string,
  to: string,
  seed: string,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
  e: Coefficients = COEFFICIENTS,
): Injured[] {
  const medical = new Map(clubs.map((club) => [club.cid, effectiveDials(club).medical]));
  const squad = players
    .filter((p) => p.cid !== null && (isSenior(p) || p.status === "academy"))
    .sort((a, b) => a.pid - b.pid);
  const out: Injured[] = [];
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    const rng = Random.fromSeed(`${seed}/training/${day}`);
    for (const p of squad) {
      if (isInjured(p, day)) continue;
      const dial = medical.get(p.cid as number) ?? 50;
      const fresh = !p.conditionDate || p.condition >= 100;
      const energy = fresh ? 1 : currentCondition(p, day, dial, c) / 100;
      const below = Math.max(0, 0.75 - energy) / 0.25;
      const risk =
        c.training.perDay *
        (1 + e.injuries.tired * (1 - energy)) *
        (1 + e.injuries.sharp * below) *
        (p.hidden.injuryProne ? e.injuries.injuryProne : 1) *
        (e.injuries.medicalBase - (e.injuries.medicalSpan * dial) / 100);
      if (!rng.bool(risk)) continue;
      const days = drawInjuryDays(rng);
      injure(p, { date: day, type: injuryType(days), days, fid: null, opponentCid: null });
      out.push({ pid: p.pid, date: day, days });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// How much a match matters

type Tables = (leagueId: string) => TableRow[];

/** Whether a league position the club could still gain or lose is within reach. */
function hasStakes(
  table: TableRow[],
  cid: number,
  leagueId: string,
  config: CompetitionsConfig,
  c: SquadCoefficients,
): boolean {
  const league = config.leagues.find((l) => l.id === leagueId);
  const me = table.find((r) => r.cid === cid);
  if (!league || !me) return false;
  // Boundaries between positions k and k+1 that change a club's season.
  const boundaries = [1];
  if (league.promotion) {
    boundaries.push(league.promotion.automatic);
    const po = league.promotion.playoffPositions;
    if (po.length) boundaries.push(po[po.length - 1] as number);
  }
  if (league.relegation) boundaries.push(table.length - league.relegation.places);
  return boundaries.some((k) => {
    const above = table[k - 1];
    const below = table[k];
    if (!above || !below) return false;
    const gap = me.position <= k ? me.points - below.points : above.points - me.points;
    return gap <= c.importance.stakesPoints;
  });
}

/** How much `fixture` matters to club `cid`: 1 is an ordinary league match. */
export function matchImportance(
  state: SeasonState,
  fixture: Fixture,
  cid: number,
  tables: Tables,
  config: CompetitionsConfig,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): number {
  const imp = c.importance;
  if (config.leagues.some((l) => playoffId(l.id) === fixture.competition)) return imp.playoff;
  const cup = config.cups.find((x) => x.id === fixture.competition);
  if (cup) {
    const fromEnd = cup.rounds.length - 1 - cup.rounds.indexOf(fixture.round);
    return fromEnd === 0
      ? imp.final
      : fromEnd === 1
        ? imp.cupSemiFinal
        : fromEnd === 2
          ? imp.cupQuarterFinal
          : imp.cupEarly;
  }
  const clubs = state.leagueClubs[fixture.competition]?.length ?? 0;
  const played = state.fixtures.filter(
    (f) =>
      f.competition === fixture.competition && f.result && (f.homeCid === cid || f.awayCid === cid),
  ).length;
  if (clubs < 2 || played < imp.lateSeason * 2 * (clubs - 1)) return 1;
  return hasStakes(tables(fixture.competition), cid, fixture.competition, config, c)
    ? imp.stakes
    : imp.nothingToPlayFor;
}

// ---------------------------------------------------------------------------
// Matchday squad

export interface MatchdayContext {
  date: string;
  importance: number;
  /** Importance of the club's next match if it is within `congestionDays`; else 0. */
  nextImportance: number;
  /**
   * The user's saved line-up, for his club in a simulated match: his XI start unless
   * tiredness or rotation says otherwise, and his bench comes first. Absent for AI clubs.
   */
  preferred?: SavedLineup;
}

/**
 * The AI's matchday squad for a club: XI in the club's formation plus 9 substitutes,
 * with today's condition in the engine input. Fewer than 16 fit seniors: academy
 * players aged 16+ fill the squad.
 */
export function pickMatchday(
  club: Club,
  squad: readonly Player[],
  ctx: MatchdayContext,
  config: CompetitionsConfig,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): EngineTeamInput {
  const s = c.selection;
  const medical = effectiveDials(club).medical;
  const preferred = ctx.preferred;
  const named = new Set([...(preferred?.slots ?? []), ...(preferred?.bench ?? [])]);
  const fit = (p: Player) => !isInjured(p, ctx.date) && !isSuspended(p);
  const youth = (p: Player) =>
    p.status === "academy" &&
    fit(p) &&
    ageOn(p.birthDate, ctx.date) >= config.rosterRules.academyMatchdayMinAge;
  const seniors = squad.filter((p) => isSenior(p) && fit(p));
  // Academy players the user picked play when fit; others only to make up the numbers.
  let pool = [...seniors, ...squad.filter((p) => named.has(p.pid) && youth(p))];
  if (seniors.length < config.rosterRules.minSeniorForMatch) {
    const academy = squad
      .filter((p) => youth(p) && !named.has(p.pid))
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    pool = [...pool, ...academy.slice(0, Math.max(0, MATCHDAY_SQUAD - pool.length))];
  }
  const formation = formationById(club.tactics.formation);
  const condition = new Map(pool.map((p) => [p.pid, currentCondition(p, ctx.date, medical, c)]));

  // Regular starters: the best XI at full condition, or the user's. Each of his counts
  // as the best in his saved slot, so a fresh XI starts as saved.
  const fresh = formation.slots.map((slot) => pool.map((p) => slotOvr(p, slot)));
  const regulars = new Set<number>();
  if (preferred) {
    const index = new Map(pool.map((p, i) => [p.pid, i]));
    preferred.slots.forEach((pid, j) => {
      const i = pid === null ? undefined : index.get(pid);
      const row = fresh[j];
      if (pid === null || i === undefined || !row) return;
      row[i] = Math.max(...row) + 1;
      regulars.add(pid);
    });
  } else {
    for (const i of maximizeAssignment(fresh)) regulars.add((pool[i] as Player).pid);
  }

  const importance = Math.max(0.1, ctx.importance);
  const fatigueWeight =
    (s.fatiguePerPoint * (1 + Math.max(0, ctx.nextImportance - importance))) / importance;
  const rest = s.restRegulars * Math.max(0, 1 - importance);
  const penalty = (p: Player): number => {
    const cond = condition.get(p.pid) ?? 100;
    let off = (100 - cond) * fatigueWeight;
    if (regulars.has(p.pid)) off += rest;
    if (cond < s.minStartCondition) off += 30;
    return off;
  };
  const penalties = pool.map(penalty);
  const scores = fresh.map((row) => row.map((ovr, j) => ovr - (penalties[j] as number)));
  const lineup = maximizeAssignment(scores).map((i) => (pool[i] as Player).pid);

  // Bench: the user's as saved, then area minimums, then the best of the rest
  // (tiredness counts a little).
  const inXi = new Set(lineup);
  const benchValue = (p: Player) => p.ovr - 0.1 * (100 - (condition.get(p.pid) ?? 100));
  const others = pool
    .filter((p) => !inXi.has(p.pid))
    .sort((a, b) => benchValue(b) - benchValue(a) || a.pid - b.pid);
  const bench: Player[] = [];
  for (const pid of preferred?.bench ?? []) {
    const p = others.find((x) => x.pid === pid);
    if (p && bench.length < BENCH_SIZE) bench.push(p);
  }
  for (const [area, minimum] of Object.entries(BENCH_MINIMUM)) {
    const have = bench.filter((p) => AREA[p.position] === area).length;
    const room = Math.max(0, Math.min(minimum - have, BENCH_SIZE - bench.length));
    bench.push(
      ...others.filter((p) => AREA[p.position] === area && !bench.includes(p)).slice(0, room),
    );
  }
  for (const p of others) {
    if (bench.length >= BENCH_SIZE) break;
    if (!bench.includes(p) && AREA[p.position] !== "gk") bench.push(p);
  }
  const chosen = [...lineup.map((pid) => pool.find((p) => p.pid === pid) as Player), ...bench];
  return {
    cid: club.cid,
    formation: formation.id,
    lineup,
    bench: bench.slice(0, BENCH_SIZE).map((p) => p.pid),
    players: chosen.map((p) => ({ ...enginePlayer(p), condition: condition.get(p.pid) ?? 100 })),
    sliders: { ...club.tactics.sliders },
    aiInGame: true,
    medicalDial: medical,
  };
}

// ---------------------------------------------------------------------------
// Playing a season's fixtures with real squads

export interface SquadPlay {
  play: PlayFixture;
  /** Both clubs' matchday squads as the AI picks them (the user's from his line-up). */
  prepare: (fixture: Fixture) => { home: EngineTeamInput; away: EngineTeamInput };
  /** Applies a match played elsewhere (watched live) to the players, as `play` does. */
  finish: (fixture: Fixture, result: MatchResult) => MatchResult;
  /** Training injuries for the days in (from, to] (call before each matchday). */
  train: (from: string, to: string) => Injured[];
  /** Players whose condition or injury changed (to save). */
  changed: Set<number>;
  /** Injury lengths (days) of every injury so far, in matches and in training. */
  injuries: number[];
  /** How many of those were training injuries. */
  trainingCount: () => number;
  /** Mean OVR of a club's 11 best fit seniors on a date (cached per day). */
  strength: (cid: number, date: string) => number;
  /** Re-reads who plays where, after transfers. */
  regroup: () => void;
}

/**
 * A PlayFixture that picks both matchday squads with the AI above, plays the match and
 * updates the players (condition, injuries). Mutates the given player objects.
 */
export function squadPlay(
  state: SeasonState,
  clubs: readonly Club[],
  players: readonly Player[],
  /** The user's club: the AI starts from his saved line-up (null: every club is the AI's). */
  userCid: number | null,
  config: CompetitionsConfig,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): SquadPlay {
  const clubById = new Map(clubs.map((club) => [club.cid, club]));
  const squads = new Map<number, Player[]>();
  const byPid = new Map<number, Player>();
  const group = () => {
    squads.clear();
    byPid.clear();
    for (const p of players) {
      byPid.set(p.pid, p);
      if (p.cid !== null && (isSenior(p) || p.status === "academy")) {
        squads.set(p.cid, [...(squads.get(p.cid) ?? []), p]);
      }
    }
  };
  group();
  const tableCache = new Map<string, TableRow[]>();
  let tableDate = "";
  const tables: Tables = (leagueId) => {
    let table = tableCache.get(leagueId);
    if (!table) {
      table = leagueTableOf(state, leagueId, config);
      tableCache.set(leagueId, table);
    }
    return table;
  };
  const changed = new Set<number>();
  const injuries: number[] = [];

  // Club strength for the weak-opponent rule: mean OVR of the 11 best fit seniors, per day.
  const strengthCache = new Map<string, number>();
  const strength = (cid: number, date: string): number => {
    const key = `${cid}/${date}`;
    let value = strengthCache.get(key);
    if (value === undefined) {
      const best = (squads.get(cid) ?? [])
        .filter((p) => isSenior(p) && !isInjured(p, date))
        .map((p) => p.ovr)
        .sort((a, b) => b - a)
        .slice(0, 11);
      value = best.reduce((sum, x) => sum + x, 0) / Math.max(1, best.length);
      strengthCache.set(key, value);
    }
    return value;
  };
  const weakOpponentFactor = (fixture: Fixture, cid: number): number => {
    const w = c.importance.weakOpponent;
    if (w.factor === 1 || state.leagueClubs[fixture.competition] === undefined) return 1;
    const opponent = fixture.homeCid === cid ? fixture.awayCid : fixture.homeCid;
    const gap = strength(cid, fixture.date) - strength(opponent, fixture.date);
    const share = Math.min(1, Math.max(0, (gap - w.from) / (w.full - w.from)));
    return 1 + (w.factor - 1) * share;
  };

  const context = (fixture: Fixture, cid: number): MatchdayContext => {
    const importance =
      matchImportance(state, fixture, cid, tables, config, c) * weakOpponentFactor(fixture, cid);
    const horizon = addDays(fixture.date, c.selection.congestionDays);
    const next = state.fixtures
      .filter(
        (f) =>
          !f.result &&
          f.date > fixture.date &&
          f.date <= horizon &&
          (f.homeCid === cid || f.awayCid === cid),
      )
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const nextImportance = next ? matchImportance(state, next, cid, tables, config, c) : 0;
    return { date: fixture.date, importance, nextImportance };
  };

  /** Both clubs' matchday squads as the AI picks them (sliders not yet set). */
  const prepare = (fixture: Fixture): { home: EngineTeamInput; away: EngineTeamInput } => {
    if (fixture.date !== tableDate) {
      tableCache.clear(); // tables as they stood before this matchday
      tableDate = fixture.date;
    }
    const side = (cid: number) => {
      const club = clubById.get(cid);
      if (!club) throw new Error(`Unknown club ${cid}`);
      // A loanee can't play against his parent club (SPEC §7.4).
      const opponent = fixture.homeCid === cid ? fixture.awayCid : fixture.homeCid;
      const squad = (squads.get(cid) ?? []).filter((p) => p.loan?.parentCid !== opponent);
      const preferred = cid === userCid ? club.tactics.lineup : undefined;
      return pickMatchday(club, squad, { ...context(fixture, cid), preferred }, config, c);
    };
    return { home: side(fixture.homeCid), away: side(fixture.awayCid) };
  };
  /** Updates the players who took part (condition, injuries) from a played match. */
  const finish = (fixture: Fixture, result: MatchResult): MatchResult => {
    for (const pid of applyDiscipline(players, fixture, result)) changed.add(pid);
    for (const stats of result.players) {
      const p = byPid.get(stats.pid);
      if (!p) continue;
      applyMatch(p, stats, fixture);
      changed.add(p.pid);
      if (stats.injuryDays > 0) injuries.push(stats.injuryDays);
    }
    return result;
  };
  const play: PlayFixture = (fixture, setup) => {
    const { home, away } = prepare(fixture);
    const result = simulateMatch({
      seed: setup.seed,
      home: { ...home, sliders: aiSliders(home, away, !setup.neutral, setup.style.directness) },
      away: { ...away, sliders: aiSliders(away, home, false, setup.style.directness) },
      neutralVenue: setup.neutral,
      style: setup.style,
      knockout: setup.knockout,
      feed: false,
    });
    return finish(fixture, result);
  };
  let training = 0;
  const train = (from: string, to: string): Injured[] => {
    const injured = trainingInjuries(clubs, players, from, to, state.seed, c);
    for (const i of injured) {
      changed.add(i.pid);
      injuries.push(i.days);
    }
    training += injured.length;
    return injured;
  };
  const regroup = () => {
    group();
    strengthCache.clear();
  };
  return {
    play,
    prepare,
    finish,
    train,
    changed,
    injuries,
    trainingCount: () => training,
    strength,
    regroup,
  };
}
