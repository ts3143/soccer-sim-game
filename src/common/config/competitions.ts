/**
 * World config (data/config/competitions_mvp.json): leagues, cups, windows, key dates
 * and roster rules. Leagues and cups are data-driven: adding a country later means
 * adding config entries, not code. Fields the season loop needs (M3) are typed then.
 */
import raw from "../../../data/config/competitions_mvp.json";

export interface StyleModifiers {
  chanceQuality: number;
  foulRate: number;
  directness: number;
}

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
