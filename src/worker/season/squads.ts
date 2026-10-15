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
 * The same AI picks the user's club in simulated matches.
 */
import { addDays, ageOn, exactAge } from "../../common/dates";
import { competitionsConfig, type CompetitionsConfig } from "../../common/config/competitions";
import { formationById } from "../../common/config/formations";
import { RATING_INDEX, type Position } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import type { Club, Fixture, Player } from "../../common/schema";
import { maximizeAssignment } from "../core/assignment";
import { slotOvr } from "../core/ovr";
import { aiSliders } from "../engine/aiTactics";
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

/** Updates a player after a match: condition from his energy at the end, and any injury. */
export function applyMatch(p: Player, stats: PlayerMatchStats, date: string): void {
  p.condition = Math.round(stats.energyEnd * 1000) / 10;
  p.conditionDate = date;
  if (stats.injuryDays > 0) {
    p.injury = { type: injuryType(stats.injuryDays), until: addDays(date, stats.injuryDays) };
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
  config: CompetitionsConfig = competitionsConfig,
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
  config: CompetitionsConfig = competitionsConfig,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): EngineTeamInput {
  const s = c.selection;
  const medical = club.budget.medical;
  const fit = (p: Player) => !isInjured(p, ctx.date);
  const seniors = squad.filter((p) => p.status === "club" && fit(p));
  let pool = seniors;
  if (seniors.length < config.rosterRules.minSeniorForMatch) {
    const academy = squad
      .filter(
        (p) =>
          p.status === "academy" &&
          fit(p) &&
          ageOn(p.birthDate, ctx.date) >= config.rosterRules.academyMatchdayMinAge,
      )
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    pool = [...seniors, ...academy.slice(0, Math.max(0, MATCHDAY_SQUAD - seniors.length))];
  }
  const formation = formationById(club.tactics.formation);
  const condition = new Map(pool.map((p) => [p.pid, currentCondition(p, ctx.date, medical, c)]));

  // Regular starters: the best XI at full condition.
  const fresh = formation.slots.map((slot) => pool.map((p) => slotOvr(p, slot)));
  const regulars = new Set(maximizeAssignment(fresh).map((i) => (pool[i] as Player).pid));

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

  // Bench: area minimums first, then the best of the rest (tiredness counts a little).
  const inXi = new Set(lineup);
  const benchValue = (p: Player) => p.ovr - 0.1 * (100 - (condition.get(p.pid) ?? 100));
  const others = pool
    .filter((p) => !inXi.has(p.pid))
    .sort((a, b) => benchValue(b) - benchValue(a) || a.pid - b.pid);
  const bench: Player[] = [];
  for (const [area, minimum] of Object.entries(BENCH_MINIMUM)) {
    bench.push(...others.filter((p) => AREA[p.position] === area).slice(0, minimum));
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
  /** Players whose condition or injury changed (to save). */
  changed: Set<number>;
  /** Injury lengths (days) of every injury in the matches played. */
  injuries: number[];
}

/**
 * A PlayFixture that picks both matchday squads with the AI above, plays the match and
 * updates the players (condition, injuries). Mutates the given player objects.
 */
export function squadPlay(
  state: SeasonState,
  clubs: readonly Club[],
  players: readonly Player[],
  config: CompetitionsConfig = competitionsConfig,
  c: SquadCoefficients = SQUAD_COEFFICIENTS,
): SquadPlay {
  const clubById = new Map(clubs.map((club) => [club.cid, club]));
  const squads = new Map<number, Player[]>();
  const byPid = new Map<number, Player>();
  for (const p of players) {
    byPid.set(p.pid, p);
    if (p.cid !== null && (p.status === "club" || p.status === "academy")) {
      squads.set(p.cid, [...(squads.get(p.cid) ?? []), p]);
    }
  }
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

  const context = (fixture: Fixture, cid: number): MatchdayContext => {
    const importance = matchImportance(state, fixture, cid, tables, config, c);
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

  const play: PlayFixture = (fixture, setup) => {
    if (fixture.date !== tableDate) {
      tableCache.clear(); // tables as they stood before this matchday
      tableDate = fixture.date;
    }
    const side = (cid: number) => {
      const club = clubById.get(cid);
      if (!club) throw new Error(`Unknown club ${cid}`);
      return pickMatchday(club, squads.get(cid) ?? [], context(fixture, cid), config, c);
    };
    const home = side(fixture.homeCid);
    const away = side(fixture.awayCid);
    const result = simulateMatch({
      seed: setup.seed,
      home: { ...home, sliders: aiSliders(home, away, !setup.neutral, setup.style.directness) },
      away: { ...away, sliders: aiSliders(away, home, false, setup.style.directness) },
      neutralVenue: setup.neutral,
      style: setup.style,
      knockout: setup.knockout,
      feed: false,
    });
    for (const stats of result.players) {
      const p = byPid.get(stats.pid);
      if (!p) continue;
      applyMatch(p, stats, fixture.date);
      changed.add(p.pid);
      if (stats.injuryDays > 0) injuries.push(stats.injuryDays);
    }
    return result;
  };
  return { play, changed, injuries };
}
