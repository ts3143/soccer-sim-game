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
  promotion: {
    /** League the promoted clubs go up to (the one relegating into this league). */
    to: string;
    automatic: number;
    /** Table positions in the play-offs, best first (e.g. 3–8). */
    playoffPositions: number[];
    promotedPlaces: number;
    /** MM-DD template: the play-off final is on the weekend nearest it. */
    playoffFinalNear: string;
  } | null;
  relegation: { places: number; to: string } | null;
  styleModifiers: StyleModifiers;
  /** Table order after points; each league sets its own (T, 2026-10-14). */
  tieBreakers: TieBreaker[];
  /** Money settings per league (T, 2026-10-16; see `_financeNote` in the config). */
  finance: LeagueFinance;
  /** Board targets, best first (SPEC §6.5; see `_boardNote` in the config). */
  board: BoardTarget[];
}

export interface BoardTarget {
  id: string;
  label: string;
  /** Met by finishing here or better. */
  position: number;
  /** How many clubs (by preseason squad strength) get this target. */
  strongest: number;
}

export interface LeagueFinance {
  /** The season's TV money for the whole league, in euros. */
  broadcastPool: number;
  /** Share split equally (monthly, August–May); the rest is merit by final position. */
  equalShare: number;
  /** Average ticket price (euros) for a reputation-50 club. */
  ticketPriceBase: number;
  /** Typical share of capacity filled. */
  attendanceBase: number;
}

export interface CupConfig {
  id: string;
  country: string;
  name: string;
  entrants: string[];
  rounds: string[];
  finalDate: string;
  /** Round (0-based) each entrant league's clubs join in; 0 when not listed. */
  entryRound: Record<string, number>;
  /**
   * A qualifying round 0 for the `clubs` lowest-placed clubs of last season's table (in
   * the first season: lowest `strength`); every other entrant joins in round 1.
   */
  preliminary: { clubs: number } | null;
  /** Euros for winning each round (last = the final), and for the beaten finalist. */
  prizeMoney: { roundWon: number[]; runnerUp: number };
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

/**
 * Clubs entering each round of a cup (0-based), from the entrant leagues' sizes: the
 * preliminary round's clubs, or each league's clubs at its entry round.
 */
export function cupEntryCounts(cup: CupConfig, leagues: readonly LeagueConfig[]): number[] {
  const counts = cup.rounds.map(() => 0);
  const total = leagues
    .filter((l) => cup.entrants.includes(l.id))
    .reduce((sum, l) => sum + l.clubs, 0);
  if (cup.preliminary) {
    counts[0] = cup.preliminary.clubs;
    counts[1] = (counts[1] ?? 0) + total - cup.preliminary.clubs;
    return counts;
  }
  for (const league of leagues.filter((l) => cup.entrants.includes(l.id))) {
    const round = cup.entryRound[league.id] ?? 0;
    counts[round] = (counts[round] ?? 0) + league.clubs;
  }
  return counts;
}

/** Throws unless the cup's rounds halve down to exactly one final (byes allowed). */
function checkCupBracket(cup: CupConfig, leagues: readonly LeagueConfig[]): void {
  const entering = cupEntryCounts(cup, leagues);
  let alive = 0;
  cup.rounds.forEach((_, round) => {
    alive += entering[round] ?? 0;
    if (alive < 2)
      throw new Error(`competitions_mvp.json: ${cup.id} round ${round + 1} has ${alive} clubs`);
    alive = Math.ceil(alive / 2);
  });
  if (alive !== 1)
    throw new Error(`competitions_mvp.json: ${cup.id} ends with ${alive} clubs, not one winner`);
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
          to: json.leagues.find((x) => x.relegation?.to === l.id)?.id ?? "",
          automatic: l.promotion.automatic,
          playoffPositions: l.promotion.playoff.positions,
          promotedPlaces: l.promotion.playoff.promotedPlaces,
          playoffFinalNear: l.promotion.playoff.schedule.finalNear,
        }
      : null,
    relegation: l.relegation,
    styleModifiers: l.styleModifiers,
    tieBreakers: parseTieBreakers(l.id, l.tieBreakers),
    finance: l.finance,
    board: l.board,
  }));
  for (const league of leagues) {
    const covered = league.board.reduce((n, t) => n + t.strongest, 0);
    if (covered !== league.clubs) {
      throw new Error(`competitions_mvp.json: ${league.id} board targets cover ${covered} clubs`);
    }
  }
  for (const league of leagues) {
    const relegation = league.relegation;
    if (!relegation) continue;
    const below = leagues.find((l) => l.id === relegation.to);
    if (!below) throw new Error(`competitions_mvp.json: ${league.id} relegates to unknown league`);
    const up = below.promotion ? below.promotion.automatic + below.promotion.promotedPlaces : 0;
    if (up !== relegation.places) {
      throw new Error(
        `competitions_mvp.json: ${league.id} relegates ${relegation.places} but ${below.id} promotes ${up}`,
      );
    }
  }
  for (const league of leagues) {
    const positions = league.promotion?.playoffPositions ?? [];
    if (league.promotion && ![0, 4, 6].includes(positions.length)) {
      throw new Error(`competitions_mvp.json: ${league.id} play-offs need 4 or 6 clubs`);
    }
    if (league.promotion && !league.promotion.to) {
      throw new Error(
        `competitions_mvp.json: ${league.id} promotes but no league relegates into it`,
      );
    }
  }
  const cups = json.cups.map((c): CupConfig => {
    const entryRound: Record<string, number> = {};
    for (const [leagueId, text] of Object.entries<string>(c.entry ?? {})) {
      const round = /^round (\d+)/i.exec(text)?.[1];
      if (!round) throw new Error(`competitions_mvp.json: ${c.id} entry "${text}" names no round`);
      entryRound[leagueId] = Number(round) - 1;
    }
    return {
      id: c.id,
      country: c.country,
      name: c.name,
      entrants: c.entrants,
      rounds: c.rounds,
      finalDate: c.finalDate,
      entryRound,
      preliminary: c.preliminary ? { clubs: c.preliminary.clubs } : null,
      prizeMoney: c.prizeMoney,
    };
  });
  for (const cup of cups) {
    checkCupBracket(cup, leagues);
    if (cup.prizeMoney.roundWon.length !== cup.rounds.length) {
      throw new Error(`competitions_mvp.json: ${cup.id} needs one prize per round`);
    }
  }
  return {
    seasonStart: json.seasonStart,
    firstSeason: Number(json.seasonStart.slice(0, 4)),
    countries: json.countries,
    leagues,
    cups,
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
