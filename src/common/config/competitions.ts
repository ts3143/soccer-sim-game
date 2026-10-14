/**
 * World config (data/config/competitions_mvp.json): leagues, cups, windows, key dates
 * and roster rules. Leagues and cups are data-driven: adding a country later means
 * adding config entries, not code.
 */
import raw from "../../../data/config/competitions_mvp.json";

export interface StyleModifiers {
  chanceQuality: number;
  foulRate: number;
  directness: number;
}

/**
 * League-table tie-breakers, applied in order (SPEC §2.1). Head-to-head criteria compare
 * only the matches among the clubs still tied; `draw` is a seeded random draw.
 */
export const TIE_BREAKERS = [
  "points",
  "goalDifference",
  "goalsFor",
  "goalsAgainst",
  "wins",
  "headToHeadPoints",
  "headToHeadGoalDifference",
  "headToHeadGoalsFor",
  "draw",
] as const;
export type TieBreaker = (typeof TIE_BREAKERS)[number];

export interface LeagueConfig {
  id: string;
  country: string;
  tier: number;
  name: string;
  clubs: number;
  rounds: number;
  /** MM-DD templates for season Y/Y+1. */
  firstMatch: string;
  lastMatch: string;
  promotion: { automatic: number; playoffPositions: number[]; promotedPlaces: number } | null;
  relegation: { places: number; to: string } | null;
  styleModifiers: StyleModifiers;
  /** Table order after points; each league sets its own (T, 2026-10-14). */
  tieBreakers: TieBreaker[];
}

export interface CupConfig {
  id: string;
  country: string;
  name: string;
  entrants: string[];
  rounds: string[];
  finalDate: string;
}

export interface RosterRules {
  maxSenior: number;
  startingSeniors: { min: number; max: number };
  academyMaxAge: number;
  mustPromoteLoanOrReleaseBy: number;
  academyMatchdayMinAge: number;
  minSeniorForMatch: number;
}

export interface CompetitionsConfig {
  /** ISO date the first simulated season starts (e.g. 2026-07-01). */
  seasonStart: string;
  /** First season, as its starting year (2026 = the 2026/27 season). */
  firstSeason: number;
  countries: { id: string; name: string; winterBreak: { from: string; to: string } | null }[];
  leagues: LeagueConfig[];
  cups: CupConfig[];
  windows: { id: string; opens: string; closes: string; deadlineDay: string }[];
  keyDates: Record<string, string>;
  rosterRules: RosterRules;
  renewals: { endOfSeasonResignPhase: boolean; expiryWarningMonths: number };
}

const isTieBreaker = (value: string): value is TieBreaker =>
  (TIE_BREAKERS as readonly string[]).includes(value);

/** Validates a league's tie-breaker list: known names, no repeats, `draw` only last. */
export function parseTieBreakers(league: string, list: readonly string[]): TieBreaker[] {
  const out: TieBreaker[] = [];
  for (const [i, name] of list.entries()) {
    if (!isTieBreaker(name)) throw new Error(`${league}: unknown tie-breaker "${name}"`);
    if (out.includes(name)) throw new Error(`${league}: tie-breaker "${name}" listed twice`);
    if (name === "draw" && i !== list.length - 1)
      throw new Error(`${league}: the "draw" tie-breaker must come last`);
    out.push(name);
  }
  if (out[0] !== "points") throw new Error(`${league}: tie-breakers must start with "points"`);
  return out;
}

function parse(json: typeof raw): CompetitionsConfig {
  const leagues = json.leagues.map((l): LeagueConfig => ({
    id: l.id,
    country: l.country,
    tier: l.tier,
    name: l.name,
    clubs: l.clubs,
    rounds: l.rounds,
    firstMatch: l.firstMatch,
    lastMatch: l.lastMatch,
    promotion: l.promotion
      ? {
          automatic: l.promotion.automatic,
          playoffPositions: l.promotion.playoff.positions,
          promotedPlaces: l.promotion.playoff.promotedPlaces,
        }
      : null,
    relegation: l.relegation,
    styleModifiers: l.styleModifiers,
    tieBreakers: parseTieBreakers(l.id, l.tieBreakers),
  }));
  for (const league of leagues) {
    if (league.relegation && !leagues.some((l) => l.id === league.relegation?.to)) {
      throw new Error(`competitions_mvp.json: ${league.id} relegates to unknown league`);
    }
  }
  return {
    seasonStart: json.seasonStart,
    firstSeason: Number(json.seasonStart.slice(0, 4)),
    countries: json.countries,
    leagues,
    cups: json.cups.map((c) => ({
      id: c.id,
      country: c.country,
      name: c.name,
      entrants: c.entrants,
      rounds: c.rounds,
      finalDate: c.finalDate,
    })),
    windows: json.windows,
    keyDates: json.keyDates,
    rosterRules: json.rosterRules,
    renewals: json.renewals,
  };
}

export const competitionsConfig: CompetitionsConfig = parse(raw);

export function leagueById(id: string): LeagueConfig {
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  if (!league) throw new Error(`Unknown league ${id}`);
  return league;
}
