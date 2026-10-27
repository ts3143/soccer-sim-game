/**
 * Competitions config (Classic's is data/config/competitions_mvp.json): leagues, cups,
 * windows, key dates and roster rules. Leagues and cups are data-driven: adding a country
 * later means adding config entries, not code. Each world has its own (worlds.ts); the
 * worker reads the save's through its session, never a global.
 */

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
    /**
     * The play-offs' structured format when the file gives one (the Super League's);
     * null for Classic's six-club format, which the season code knows (SPEC §2.2).
     */
    playoffFormat: PlayoffFormat | null;
  } | null;
  /** A play-off for the title among the top of the table (the Super League's Star tier). */
  titlePlayoff: PlayoffFormat | null;
  relegation: { places: number; to: string } | null;
  styleModifiers: StyleModifiers;
  /** Table order after points; each league sets its own (T, 2026-10-14). */
  tieBreakers: TieBreaker[];
  /** Money settings per league (T, 2026-10-16; see `_financeNote` in the config). */
  finance: LeagueFinance;
  /** Board targets, best first (SPEC §6.5; see `_boardNote` in the config). */
  board: BoardTarget[];
}

/** A knockout play-off among table positions (SPEC §17.2). Used by the season from SL2. */
export interface PlayoffFormat {
  /** Table positions taking part, best first. */
  positions: number[];
  /** The first round's ties as [home seed, away seed]; later rounds pair winners in order. */
  firstRound: [number, number][];
  /** Each round, first to final: two-legged rounds have the higher seed host the second leg. */
  rounds: { id: string; legs: 1 | 2; neutral: boolean }[];
  /** MM-DD template: the final is on the weekend nearest it. */
  finalNear: string;
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

/** A tiered soft cap on payrolls (SPEC §17.7; the Super League's). Money rules arrive in SL3. */
export interface SoftCapConfig {
  /** The top tier's cap on a club's payroll, in euros a season. */
  cap: number;
  /** Each league's cap as a share of `cap`. */
  tierShare: Record<string, number>;
  /** Opening payrolls as a share of the club's cap. */
  openingPayroll: { min: number; max: number };
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
  /** null: no cap (Classic, whose money rule is FFP). */
  softCap: SoftCapConfig | null;
}

/** A league's payroll cap in euros, or null in a world without one. */
export function capOf(config: CompetitionsConfig, leagueId: string): number | null {
  const softCap = config.softCap;
  return softCap ? Math.round(softCap.cap * (softCap.tierShare[leagueId] ?? 1)) : null;
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
function checkCupBracket(cup: CupConfig, leagues: readonly LeagueConfig[], file: string): void {
  const entering = cupEntryCounts(cup, leagues);
  let alive = 0;
  cup.rounds.forEach((_, round) => {
    alive += entering[round] ?? 0;
    if (alive < 2) throw new Error(`${file}: ${cup.id} round ${round + 1} has ${alive} clubs`);
    alive = Math.ceil(alive / 2);
  });
  if (alive !== 1) throw new Error(`${file}: ${cup.id} ends with ${alive} clubs, not one winner`);
}

/** A competitions config file's JSON (data/config/), as imported. */
/** A play-off format as a competitions file gives it. */
interface PlayoffFile {
  positions: number[];
  firstRound?: number[][];
  rounds?: { id: string; legs: number; neutral: boolean }[];
  allSingleLeg?: boolean;
  schedule: { finalNear: string };
}

const titlePlayoff = (where: string, file: PlayoffFile, clubs: number): PlayoffFormat => {
  const format = parsePlayoff(`${where} title play-off`, file, clubs);
  if (!format) throw new Error(`${where}: a title play-off needs its first round and rounds`);
  return format;
};

/** A competitions config file's JSON (data/config/), as parseCompetitions reads it. */
export interface CompetitionsFile {
  seasonStart: string;
  countries: { id: string; name: string; winterBreak: { from: string; to: string } | null }[];
  leagues: {
    id: string;
    country: string;
    tier: number;
    name: string;
    clubs: number;
    rounds: number;
    firstMatch: string;
    lastMatch: string;
    promotion: { automatic: number; playoff: PlayoffFile & { promotedPlaces: number } } | null;
    titlePlayoff?: PlayoffFile;
    relegation: { places: number; to: string } | null;
    styleModifiers: StyleModifiers;
    tieBreakers: string[];
    finance: LeagueFinance;
    board: BoardTarget[];
  }[];
  cups: {
    id: string;
    country: string;
    name: string;
    entrants: string[];
    rounds: string[];
    finalDate: string;
    entry?: Record<string, string>;
    preliminary?: { clubs: number } | null;
    prizeMoney: { roundWon: number[]; runnerUp: number };
  }[];
  windows: { id: string; opens: string; closes: string; deadlineDay: string }[];
  keyDates: Record<string, string>;
  rosterRules: RosterRules;
  renewals: { endOfSeasonResignPhase: boolean; expiryWarningMonths: number };
  softCap?: SoftCapConfig;
}

/**
 * Reads a structured play-off format (null when the file gives none) and checks it: the
 * first round pairs every position once, each round halves the field down to one final,
 * legs are 1 or 2. `allSingleLeg` makes every round single-leg.
 */
function parsePlayoff(where: string, file: PlayoffFile, clubs: number): PlayoffFormat | null {
  if (!file.firstRound || !file.rounds) return null;
  const firstRound = file.firstRound.map((tie) => {
    if (tie.length !== 2) throw new Error(`${where}: a tie needs two seeds`);
    return [tie[0], tie[1]] as [number, number];
  });
  const seeds = firstRound.flat().sort((a, b) => a - b);
  const positions = [...file.positions].sort((a, b) => a - b);
  if (seeds.join() !== positions.join()) {
    throw new Error(`${where}: the first round must pair every play-off position once`);
  }
  if (positions.some((p) => p < 1 || p > clubs)) {
    throw new Error(`${where}: play-off positions must be table positions`);
  }
  if (2 ** file.rounds.length !== positions.length) {
    throw new Error(
      `${where}: ${positions.length} clubs need ${Math.log2(positions.length)} rounds`,
    );
  }
  const rounds = file.rounds.map((r) => {
    if (r.legs !== 1 && r.legs !== 2) throw new Error(`${where}: ${r.id} has ${r.legs} legs`);
    return { id: r.id, legs: file.allSingleLeg ? 1 : r.legs, neutral: r.neutral } as const;
  });
  return { positions: file.positions, firstRound, rounds, finalNear: file.schedule.finalNear };
}

/** Reads and checks a competitions config file; `file` names it in errors. */
export function parseCompetitions(json: CompetitionsFile, file: string): CompetitionsConfig {
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
          playoffFormat: parsePlayoff(`${file}: ${l.id} play-offs`, l.promotion.playoff, l.clubs),
        }
      : null,
    titlePlayoff: l.titlePlayoff ? titlePlayoff(`${file}: ${l.id}`, l.titlePlayoff, l.clubs) : null,
    relegation: l.relegation,
    styleModifiers: l.styleModifiers,
    tieBreakers: parseTieBreakers(l.id, l.tieBreakers),
    finance: l.finance,
    board: l.board,
  }));
  for (const league of leagues) {
    const covered = league.board.reduce((n, t) => n + t.strongest, 0);
    if (covered !== league.clubs) {
      throw new Error(`${file}: ${league.id} board targets cover ${covered} clubs`);
    }
  }
  for (const league of leagues) {
    const relegation = league.relegation;
    if (!relegation) continue;
    const below = leagues.find((l) => l.id === relegation.to);
    if (!below) throw new Error(`${file}: ${league.id} relegates to unknown league`);
    const up = below.promotion ? below.promotion.automatic + below.promotion.promotedPlaces : 0;
    if (up !== relegation.places) {
      throw new Error(
        `${file}: ${league.id} relegates ${relegation.places} but ${below.id} promotes ${up}`,
      );
    }
  }
  for (const league of leagues) {
    const positions = league.promotion?.playoffPositions ?? [];
    if (league.promotion && ![0, 4, 6].includes(positions.length)) {
      throw new Error(`${file}: ${league.id} play-offs need 4 or 6 clubs`);
    }
    if (league.promotion && !league.promotion.to) {
      throw new Error(`${file}: ${league.id} promotes but no league relegates into it`);
    }
  }
  const cups = json.cups.map((c): CupConfig => {
    const entryRound: Record<string, number> = {};
    for (const [leagueId, text] of Object.entries<string>(c.entry ?? {})) {
      const round = /^round (\d+)/i.exec(text)?.[1];
      if (!round) throw new Error(`${file}: ${c.id} entry "${text}" names no round`);
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
  for (const league of leagues) {
    if (json.softCap && json.softCap.tierShare[league.id] === undefined) {
      throw new Error(`${file}: the soft cap has no share for ${league.id}`);
    }
  }
  for (const cup of cups) {
    checkCupBracket(cup, leagues, file);
    if (cup.prizeMoney.roundWon.length !== cup.rounds.length) {
      throw new Error(`${file}: ${cup.id} needs one prize per round`);
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
    softCap: json.softCap
      ? {
          cap: json.softCap.cap,
          tierShare: json.softCap.tierShare,
          openingPayroll: json.softCap.openingPayroll,
        }
      : null,
  };
}

export function leagueById(config: CompetitionsConfig, id: string): LeagueConfig {
  const league = config.leagues.find((l) => l.id === id);
  if (!league) throw new Error(`Unknown league ${id}`);
  return league;
}
