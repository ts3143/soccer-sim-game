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
    /** Clubs promoted through the play-off: its winner. */
    promotedPlaces: number;
  } | null;
  /** The play-off after the league season, for promotion or for the title. */
  playoff: PlayoffFormat | null;
  relegation: { places: number; to: string } | null;
  styleModifiers: StyleModifiers;
  /** Table order after points; each league sets its own (T, 2026-10-14). */
  tieBreakers: TieBreaker[];
  /** Money settings per league (T, 2026-10-16; see `_financeNote` in the config). */
  finance: LeagueFinance;
  /** Board targets, best first (SPEC §6.5; see `_boardNote` in the config). */
  board: BoardTarget[];
}

/**
 * A knockout play-off among table positions (SPEC §2.2, §17.2), round by round. A round's
 * clubs are those joining it (`entrants`) and the previous round's winners; they meet as
 * the round pairs them. A single match is hosted by the better-placed club (or played at a
 * neutral venue); in a two-legged tie the better-placed club hosts the second leg.
 */
export interface PlayoffFormat {
  /** What the winner gets: promotion, or the title (SPEC §17.2: Star's champion). */
  decides: "promotion" | "title";
  /** Table positions taking part, best first. */
  positions: number[];
  /** First to final. */
  rounds: PlayoffRound[];
  /** MM-DD template: the final is on the weekend nearest it. */
  finalNear: string;
  /** Euros per round won (the last is the final) and for the beaten finalist; null: none. */
  prizeMoney: { roundWon: number[]; runnerUp: number } | null;
}

export interface PlayoffRound {
  /** Shown, and stored on the round's fixtures (unique within the play-off). */
  name: string;
  legs: 1 | 2;
  neutral: boolean;
  /** Table positions joining in this round (the others joined earlier). */
  entrants: number[];
  /**
   * How the round's clubs meet. `reseed`: best-placed against worst-placed, second against
   * second-worst, and so on. `bracket`: the previous round's ties in twos, in order. `ties`:
   * fixed ties as [table position, table position] (a first round only).
   */
  pairing: "reseed" | "bracket" | { ties: [number, number][] };
}

export interface BoardTarget {
  id: string;
  label: string;
  /** Met by finishing here or better (and what the board reads during the season). */
  position: number;
  /** Also met by reaching this round of the league's play-off (T, 2026-10-27). */
  playoffRound?: string;
  /** Also met by winning the league's play-off. */
  playoffWin?: boolean;
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
  /**
   * The `maxSenior` limit counts from the season's first league match only (SPEC §17.4):
   * in the off-season a club may hold more; AI clubs trim before that match, the user
   * can't play it while over. Absent: always (Classic).
   */
  maxSeniorFromFirstMatch?: boolean;
}

/** Free agency in a world without transfer windows (SPEC §17.6). See its config `_note`. */
export interface FreeAgencyConfig {
  /** AI market days for free agents: every this many days from 1 July. */
  everyDays: number;
  /** Until this MM-DD, AI clubs sign up to `squadTarget` seniors... */
  busyUntil: string;
  squadTarget: number;
  /** ...after it only to fill a gap: clubs below this many seniors, up to it. */
  gapBelow: number;
  /** Signings per club per market day. */
  perDay: number;
  /**
   * The roster deadline: after the league round at this share of the regular season (the
   * round rounded up), no signings until 1 July.
   */
  deadlineAfterRoundShare: number;
}

/** A club's trade outlook (SPEC §17.6): contending clubs want OVR now, rebuilding ones POT. */
export type TradeState = "contending" | "rebuilding";
type ByState = Record<TradeState, number>;

/** AI trade valuation (SPEC §17.6; the Super League's). See `_note` in its config. */
export interface TradesConfig {
  /** Board targets (ids) whose clubs contend; the others rebuild. */
  contendingTargets: string[];
  value: {
    perOvr: number;
    /** POT counts fully up to this age and not from `youthNoneFrom`. */
    youthFullUntil: number;
    youthNoneFrom: number;
    potShare: ByState;
    declineFrom: ByState;
    declinePerYear: ByState;
    /** × while his contract ends this 30 June. */
    finalYear: ByState;
    contract: { weight: number; years: number; min: number; max: number };
  };
  /** Squad places by value, [up to place, weight]. */
  squadWeights: [number, number][];
  /** Value points per cap's worth of yearly wages saved. */
  salary: { underCap: number; overCap: number; rebuilding: number };
  picks: { weight: ByState; yearDiscount: number };
}

/** The draft (SPEC §17.5; the Super League's). See `_note` in its config. */
export interface DraftConfig {
  rounds: number;
  classSize: number;
  /** A class appears on 1 July this many seasons before its draft (so 1 + this are visible). */
  classesAhead: number;
  /** Picks exist (and can be traded) for the coming draft and this many seasons' after it. */
  picksAhead: number;
  /** Picks drawn by lottery from the pool; the rest of the pool follows in odds order. */
  lotteryPicks: number;
  /** Prospects' ages at the draft. */
  ages: { min: number; max: number };
  /** Target OVR: mean + perYear × (age − ages.min) + noise (sd), clamped to [min, max]. */
  prospectQuality: {
    mean: number;
    perYear: number;
    sd: number;
    min: number;
    max: number;
    /** Extra ceiling per standard deviation above the mean, as for academy players. */
    talentHeadroom: number;
    /** Expected OVR growth a summer: a class generated ahead starts lower by this a summer. */
    growthPerYear: number;
  };
  /** The lottery pool's table places, best odds first, with each one's chance at pick 1 (%). */
  lotteryPool: { league: string; position: number; odds: number }[];
  /** Rookie contracts: years, and wage by pick ([pick, euros] points, interpolated). */
  rookieContract: { years: number; wageByPick: [number, number][] };
  /**
   * AI picks: weight on POT (the rest on OVR), and the bonus per senior a club is short of
   * its target in the prospect's area.
   */
  aiPick: {
    potWeight: number;
    needBonus: number;
    areaTargets: Record<"gk" | "def" | "mid" | "att", number>;
  };
}

/** A tiered soft cap on payrolls (SPEC §17.7; the Super League's). Money rules arrive in SL3. */
export interface SoftCapConfig {
  /** The top tier's cap on a club's payroll, in euros a season. */
  cap: number;
  /** Each league's cap as a share of `cap`. */
  tierShare: Record<string, number>;
  /** Opening payrolls as a share of the club's cap. */
  openingPayroll: { min: number; max: number };
  /** The wage of a free agent a club over the cap may still sign, euros a year. */
  minimumWage: number;
  /** Tax per euro of payroll above the cap at season end. */
  luxuryTaxRate: number;
  /** Over the cap, a trade may bring back at most this times the wages sent out. */
  tradeMatching: number;
  /** Seasons a relegated club keeps its old tier's cap. */
  graceSeasons: number;
  /** AI re-signings price wages as if a club's revenue were its cap / this ratio. */
  aiWageRatio: number;
  /**
   * The AI re-signs its core players over the cap while its payroll stays within the cap
   * plus this share of it (others only within the cap).
   */
  coreOverCap: number;
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
  /** Free agency without windows (the Super League's); null where windows rule (Classic). */
  freeAgency: FreeAgencyConfig | null;
  renewals: { endOfSeasonResignPhase: boolean; expiryWarningMonths: number };
  /** null: no cap (Classic, whose money rule is FFP). */
  softCap: SoftCapConfig | null;
  /** null: no draft (Classic, whose clubs have academies). */
  draft: DraftConfig | null;
  /** null: no trades (Classic, whose players move by transfers). */
  trades: TradesConfig | null;
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

/** A play-off as a competitions file gives it (see PlayoffFormat). */
interface PlayoffFile {
  decides: string;
  rounds: {
    name: string;
    legs: number;
    neutral: boolean;
    entrants?: number[];
    pairing?: string;
    ties?: number[][];
  }[];
  allSingleLeg: boolean;
  finalNear: string;
  prizeMoney?: { roundWon: number[]; runnerUp: number };
}

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
    promotion: { automatic: number; promotedPlaces: number } | null;
    playoff?: PlayoffFile | null;
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
  freeAgency?: FreeAgencyConfig;
  trades?: Omit<TradesConfig, "squadWeights"> & { squadWeights: number[][] };
  draft?: Omit<DraftConfig, "rookieContract"> & {
    rookieContract: { years: number; wageByPick: number[][] };
  };
}

/**
 * Reads a play-off and checks it: every position joins once and is a table position, each
 * round has an even number of clubs and the final two, legs are 1 or 2 (the final 1), round
 * names are unique, fixed ties only in the first round, `bracket` only after a round of
 * ties with nobody joining. `allSingleLeg` makes every round single-leg.
 */
function parsePlayoff(where: string, file: PlayoffFile, clubs: number): PlayoffFormat {
  if (file.decides !== "promotion" && file.decides !== "title") {
    throw new Error(`${where}: a play-off decides promotion or the title`);
  }
  const fail = (why: string) => {
    throw new Error(`${where}: ${why}`);
  };
  let alive = 0;
  const rounds = file.rounds.map((r, i): PlayoffRound => {
    if (r.legs !== 1 && r.legs !== 2) fail(`${r.name} has ${r.legs} legs`);
    const ties = r.ties?.map((t): [number, number] => {
      if (t.length !== 2) fail(`a tie in ${r.name} needs two positions`);
      return [t[0] as number, t[1] as number];
    });
    if (ties && i > 0) fail(`fixed ties only in the first round, not ${r.name}`);
    const entrants = ties ? ties.flat() : (r.entrants ?? []);
    const pairing = ties ? { ties } : r.pairing;
    if (pairing !== "reseed" && pairing !== "bracket" && !ties) {
      fail(`${r.name} pairs by reseed, bracket or fixed ties`);
    }
    if (pairing === "bracket" && (i === 0 || entrants.length > 0)) {
      fail(`${r.name} can only pair the previous round's ties, with nobody joining`);
    }
    alive += entrants.length;
    if (alive % 2 !== 0 || alive < 2) fail(`${r.name} has ${alive} clubs`);
    alive /= 2;
    return {
      name: r.name,
      legs: file.allSingleLeg ? 1 : (r.legs as 1 | 2),
      neutral: r.neutral,
      entrants,
      pairing: pairing as PlayoffRound["pairing"],
    };
  });
  if (alive !== 1) fail(`ends with ${alive} winners, not one`);
  if (rounds.at(-1)?.legs !== 1) fail("the final is a single match");
  if (new Set(rounds.map((r) => r.name)).size !== rounds.length) fail("round names repeat");
  const positions = rounds.flatMap((r) => r.entrants).sort((a, b) => a - b);
  if (new Set(positions).size !== positions.length) fail("a position joins twice");
  if (positions.some((p) => p < 1 || p > clubs)) fail("play-off positions must be table positions");
  if (file.prizeMoney && file.prizeMoney.roundWon.length !== rounds.length) {
    fail("needs one prize per round");
  }
  return {
    decides: file.decides,
    positions,
    rounds,
    finalNear: file.finalNear,
    prizeMoney: file.prizeMoney ?? null,
  };
}

/** Reads the draft and checks its pool's places and its wage table. */
function parseDraft(
  json: NonNullable<CompetitionsFile["draft"]>,
  leagues: readonly LeagueConfig[],
  file: string,
): DraftConfig {
  for (const slot of json.lotteryPool) {
    const league = leagues.find((l) => l.id === slot.league);
    if (!league || slot.position < 1 || slot.position > league.clubs) {
      throw new Error(`${file}: the lottery pool has no ${slot.league} ${slot.position}`);
    }
  }
  const wageByPick = json.rookieContract.wageByPick.map((point): [number, number] => {
    if (point.length !== 2) throw new Error(`${file}: a rookie wage needs a pick and a wage`);
    return [point[0] as number, point[1] as number];
  });
  if (wageByPick.some(([pick], i) => i > 0 && pick <= (wageByPick[i - 1]?.[0] ?? 0))) {
    throw new Error(`${file}: rookie wages must be by increasing pick`);
  }
  return {
    rounds: json.rounds,
    classSize: json.classSize,
    classesAhead: json.classesAhead,
    picksAhead: json.picksAhead,
    lotteryPicks: json.lotteryPicks,
    ages: json.ages,
    prospectQuality: json.prospectQuality,
    lotteryPool: json.lotteryPool,
    rookieContract: { years: json.rookieContract.years, wageByPick },
    aiPick: json.aiPick,
  };
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
          promotedPlaces: l.promotion.promotedPlaces,
        }
      : null,
    playoff: l.playoff ? parsePlayoff(`${file}: ${l.id} play-off`, l.playoff, l.clubs) : null,
    relegation: l.relegation,
    styleModifiers: l.styleModifiers,
    tieBreakers: parseTieBreakers(l.id, l.tieBreakers),
    finance: l.finance,
    board: l.board,
  }));
  for (const league of leagues) {
    for (const t of league.board) {
      const rounds = league.playoff?.rounds.map((r) => r.name) ?? [];
      if (
        (t.playoffRound && !rounds.includes(t.playoffRound)) ||
        (t.playoffWin && !league.playoff)
      ) {
        throw new Error(`${file}: ${league.id}'s ${t.id} target names a play-off it doesn't have`);
      }
    }
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
    const promotes = (league.promotion?.promotedPlaces ?? 0) > 0;
    if (promotes !== (league.playoff?.decides === "promotion")) {
      throw new Error(
        `${file}: ${league.id} promotes through a play-off exactly when it has a promotion play-off`,
      );
    }
    if (promotes && league.promotion?.promotedPlaces !== 1) {
      throw new Error(`${file}: ${league.id}'s play-off promotes its one winner`);
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
    freeAgency: json.freeAgency ?? null,
    renewals: json.renewals,
    softCap: json.softCap
      ? {
          cap: json.softCap.cap,
          tierShare: json.softCap.tierShare,
          openingPayroll: json.softCap.openingPayroll,
          minimumWage: json.softCap.minimumWage,
          luxuryTaxRate: json.softCap.luxuryTaxRate,
          tradeMatching: json.softCap.tradeMatching,
          graceSeasons: json.softCap.graceSeasons,
          aiWageRatio: json.softCap.aiWageRatio,
          coreOverCap: json.softCap.coreOverCap,
        }
      : null,
    draft: json.draft ? parseDraft(json.draft, leagues, file) : null,
    trades: json.trades
      ? {
          ...json.trades,
          squadWeights: json.trades.squadWeights.map(([upTo, weight]) => {
            if (upTo === undefined || weight === undefined) {
              throw new Error(`${file}: trades.squadWeights needs [place, weight] pairs`);
            }
            return [upTo, weight];
          }),
        }
      : null,
  };
}

export function leagueById(config: CompetitionsConfig, id: string): LeagueConfig {
  const league = config.leagues.find((l) => l.id === id);
  if (!league) throw new Error(`Unknown league ${id}`);
  return league;
}
