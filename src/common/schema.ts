/**
 * Types for every store of a league save (SPEC §12). Shared by the worker (which owns
 * the data) and the UI (which receives plain copies through the worker API).
 *
 * Conventions (CLAUDE.md): integer IDs; money in whole euros, wages per year; dates as
 * ISO strings (YYYY-MM-DD); every season-scoped row carries `season`, the year the
 * season starts (2026 = 2026/27). Stores that later milestones fill are typed now with
 * the fields the spec names, and extended (with a DB version bump) when built.
 */
import type { Position } from "./config/ratings";
import type { WorldId } from "./config/worlds";
import type { MatchResult } from "./match";

// ---------------------------------------------------------------------------
// Save list (global database)

/** One league save, as listed in Manage Leagues. */
export interface LeagueSummary {
  lid: number;
  name: string;
  /** ISO date-time. */
  createdAt: string;
  /** ISO date-time. */
  lastPlayedAt: string;
  /** The user's club and the current season, for the save list. */
  clubName: string;
  season: number;
}

// ---------------------------------------------------------------------------
// meta (key-value rows)

/**
 * Season phases (SPEC §3.1). Preseason runs from 1 July to the season's first match; the
 * regular season covers every league, cup and play-off match (windows are dated events
 * inside it); the end of season runs from the last match to 30 June. There is no re-sign
 * phase: renewals happen in windows.
 */
/**
 * Where the season is. After the end of the season, a world with a draft has its draft
 * lottery and draft, one with a re-signing period that period (SPEC §17.6), before 1 July.
 */
export type Phase =
  "preseason" | "regularSeason" | "endOfSeason" | "draftLottery" | "draft" | "resigning";

export interface GameMeta {
  /** Display name of the save. */
  name: string;
  /** Seed the world was generated from. */
  seed: string;
  createdAt: string;
  season: number;
  phase: Phase;
  /** Current in-game date (ISO). */
  date: string;
  userCid: number;
  /** Game version that created the save, for future migrations. */
  createdWithVersion: number;
  /** Set when the board sacks the user: the date and the clubs offering him a job. */
  fired?: { date: string; offers: number[] } | null;
  /**
   * Since when players' injury histories are kept: the league's start, or for an older
   * save the day it was upgraded (league DB v6).
   */
  injuriesSince?: string;
}

/** Next free integer ID per entity type. */
export interface IdCounters {
  pid: number;
  fid: number;
  oid: number;
  xid: number;
  mid: number;
  aid: number;
}

/**
 * The current season's competition state (src/worker/season): who is in each league
 * this season and how far each cup has got. Fixtures live in their own store.
 */
export interface SeasonMeta {
  season: number;
  leagueClubs: Record<string, number[]>;
  /** Per cup: the clubs entering each round (0-based). */
  cupEntrants: Record<string, number[][]>;
  /** Per cup: the clubs in each round drawn so far (byes included). */
  cupParticipants: Record<string, number[][]>;
  /** End of season: promotion and relegation already applied. */
  movesApplied: boolean;
  /** TV merit money for this season has been paid (absent in pre-M4 saves). */
  meritPaid?: boolean;
}

export interface MetaRows {
  game: GameMeta;
  /** Absent in saves made before M3 until the season is first set up. */
  season: SeasonMeta;
  ids: IdCounters;
  /** Saved state of the league's main random stream. */
  rng: { seed: string; words: readonly [number, number, number, number] };
  /**
   * The save's world (SPEC §17.1; saves before league DB v8 are Classic), with the
   * leagues and per-league modifiers it had when created.
   */
  world: { id: WorldId; leagues: string[]; styleModifiers: Record<string, StyleModifiersRow> };
}

export interface StyleModifiersRow {
  chanceQuality: number;
  foulRate: number;
  directness: number;
}

// ---------------------------------------------------------------------------
// competitions

export interface CompetitionRow {
  /** Config ID, e.g. "ENG1" or "ENGCUP". */
  id: string;
  type: "league" | "cup";
  country: string;
  name: string;
  tier: number | null;
  /** League links for promotion/relegation; null where none. */
  relegationTo: string | null;
  promotionTo: string | null;
}

// ---------------------------------------------------------------------------
// clubs + clubSeasons

export interface SliderSettings {
  mentality: number;
  pressing: number;
  directness: number;
}

/** The user's saved line-up (M6 Tactics page): who starts in each slot, and the bench. */
export interface SavedLineup {
  /** Player ID per formation slot (11, slot order as in the formation config); null = empty. */
  slots: (number | null)[];
  /** Substitutes in order (up to the bench size). */
  bench: number[];
}

/**
 * A club's saved tactics. The formation is the club's own in every match. AI clubs'
 * sliders and line-ups are picked by the AI before each match. The user's are his alone
 * (T, 2026-10-25): watched matches start from them; in simulated matches the AI starts
 * from his line-up (rotation, injuries and suspensions for that match only) and picks
 * the sliders.
 */
export interface Tactics {
  formation: string;
  sliders: SliderSettings;
  /** User's club only: the AI's pick when he takes the club, then what he saves. */
  lineup?: SavedLineup;
}

/** Budget dial levels, 0–100; 50 is a typical club. Coaching/Youth/Medical/Facilities (MVP). */
export interface BudgetDials {
  coaching: number;
  youth: number;
  medical: number;
  facilities: number;
}

export interface Club {
  cid: number;
  /** Lowercase code from the club data; names the crest file. */
  code: string;
  name: string;
  short: string;
  abbr: string;
  city: string;
  country: string;
  capacity: number;
  colors: { primary: string; secondary: string; tertiary: string };
  market: number;
  crest: { shape: string; motif: string; initials: string };
  /** League the club currently plays in. */
  leagueId: string;
  /** Season-1 revenue anchor (whole euros), from the club data. */
  revenueAnchor: number;
  /** Target best-XI OVR the opening squad was generated to. */
  strengthTarget: number;
  tactics: Tactics;
  budget: BudgetDials;
  /** Euros per ticket for the season. Provisional until the economy (M4). */
  ticketPrice: number;
  /**
   * The user's club only (M6): false once he sets his own price, which then stays from
   * season to season. Absent or true: the AI's fair price, set each preseason.
   */
  ticketAuto?: boolean;
  /** Current cash in whole euros (season-end snapshots go in clubSeasons). */
  cash: number;
  /**
   * Commercial income (sponsorship, merchandise) per season at `reputation`; it scales with
   * the club's reputation from there (src/worker/finance). Set from the revenue anchor at
   * league creation. Absent in pre-M4 saves (derived on first use).
   */
  commercial?: { base: number; reputation: number };
  /**
   * FFP standing (SPEC §6.4): warned after a season over the ratio; a second in a row bans
   * signings until `bannedUntil` (the next summer window's deadline day).
   */
  ffp?: { warned: boolean; bannedUntil: string | null };
  /**
   * A relegated club's grace under the soft cap (SPEC §17.7): it keeps `leagueId`'s cap
   * through season `through`. Absent where there is no cap or no grace.
   */
  capGrace?: { leagueId: string; through: number } | null;
  /**
   * The user's one budget control (SPEC §6.3): the share of the FFP headroom kept for
   * wages, the rest backing transfer fees. Absent: half each.
   */
  wageShare?: number;
  /** Facilities quality 0–100: follows the Facilities dial slowly (absent = 50). */
  facilitiesLevel?: number;
  /**
   * What the dials do (ZenGM-style relative expense levels): 50 plus how far this club's
   * dials are from the average club's, set each preseason. Costs follow `budget`, effects
   * follow this. Absent = the dials themselves.
   */
  budgetEffect?: BudgetDials;
  /**
   * Players the user released under contract (M6, SPEC §7.6): their wages are still paid
   * monthly until their contracts would have ended, any fee left keeps being amortised,
   * and both count toward the squad cost.
   */
  released?: ReleasedContract[];
}

export interface ReleasedContract {
  pid: number;
  name: string;
  /** Euros a year, still owed. */
  wage: number;
  /** The old contract's end date (30 June). */
  until: string;
  /** His transfer fee not yet amortised: it keeps being amortised on the same schedule. */
  fee?: { remaining: number; perYear: number };
}

export interface ClubSeason {
  cid: number;
  season: number;
  leagueId: string;
  hype: number;
  reputation: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Final league position; null until the season ends. */
  finish: number | null;
  revenue: Record<string, number>;
  expenses: Record<string, number>;
  /** Cash at season end; null until then. */
  cashEnd: number | null;
  boardExpectation: string | null;
  boardConfidence: number | null;
  /** Wages and fee amortisation over revenue (with profit on sales), set at season end (FFP). */
  squadCostRatio: number | null;
  /** The season's transfer-fee amortisation (non-cash, SPEC §6.3), month by month. */
  amortisation?: number;
  /** Profit on player sales (fee less the player's unamortised balance; can be negative). */
  salesProfit?: number;
  /** Revenue the season's budget dials are costed against (last season's, or the anchor). */
  budgetBase?: number;
  /** Board confidence at the start of the season (it moves toward the live value). */
  boardStart?: number;
  /** This season the board already warned the user / would have sacked its manager. */
  boardWarned?: boolean;
  boardSacked?: boolean;
}

// ---------------------------------------------------------------------------
// players

export type CurveType = "normal" | "early" | "late" | "ageless";
export type MoodTrait = "fame" | "loyalty" | "money" | "winning";
/** `prospect`: in the coming draft's class (SPEC §17.5): unattached, not yet a free agent. */
export type PlayerStatus = "club" | "academy" | "loan" | "freeAgent" | "retired" | "prospect";
export type Foot = "L" | "R";

/** One development snapshot (generation, then every summer/winter update). */
export interface RatingsEntry {
  season: number;
  date: string;
  /** The 22 ratings in RATING_CODES order. */
  ratings: number[];
  /** OVR at the listed position, and POT, at this snapshot. */
  ovr: number;
  pot: number;
}

export interface Contract {
  /** Whole euros per year. */
  wage: number;
  /** ISO date; contracts end on 30 June. */
  expires: string;
}

export interface Injury {
  type: string;
  /** ISO date the player is fit again. */
  until: string;
}

/** One injury in a player's history (T, 2026-10-25). */
export interface InjuryRecord {
  /** The day it happened. */
  date: string;
  type: string;
  /** Days out, as expected when it happened. */
  days: number;
  /** In a match: its fixture and the opponent; both null for a training injury. */
  fid: number | null;
  opponentCid: number | null;
}

export interface TransferRecord {
  date: string;
  season: number;
  fromCid: number | null;
  toCid: number | null;
  fee: number;
  type: "transfer" | "loan" | "freeAgent" | "academyPromotion" | "release" | "draft";
}

/** What development needs from the matches since the last update (SPEC §5.3). */
export interface DevTally {
  /** This half-season: minutes, appearances and the sum of match ratings. */
  minutes: number;
  appearances: number;
  ratingTotal: number;
  /** The whole season so far (for ceiling decay at the summer update). */
  seasonMinutes: number;
}

export interface Player {
  pid: number;
  firstName: string;
  lastName: string;
  nationality: string;
  nationality2: string | null;
  birthDate: string;
  birthplace: string;
  heightCm: number;
  weightKg: number;
  foot: Foot;
  /** Listed position = the best of the 10 position OVRs. */
  position: Position;
  /** Other positions within a few points of the listed one. */
  secondaryPositions: Position[];
  shirtNumber: number | null;
  /** Oldest first; the last entry holds the current ratings, OVR and POT. */
  ratingsHistory: RatingsEntry[];
  /** OVR at each of the 10 positions (POSITIONS order), current. No wrong-foot penalty. */
  ovrs: number[];
  ovr: number;
  pot: number;
  /** Never shown in the MVP UI. */
  hidden: { ceiling: number; curve: CurveType; injuryProne: boolean; hothead: boolean };
  moodTraits: MoodTrait[];
  status: PlayerStatus;
  /** Club the player is registered with (his loan club while on loan); null for free agents. */
  cid: number | null;
  loan: { parentCid: number; until: string; wageShare: number } | null;
  contract: Contract | null;
  injury: Injury | null;
  /** Every injury since `GameMeta.injuriesSince`, oldest first (absent: none yet). */
  injuries?: InjuryRecord[];
  /**
   * Between-match condition, 0–100, as of `conditionDate`. It recovers with rest from
   * then on (src/worker/season/squads.ts works out today's value).
   */
  condition: number;
  /** Date `condition` was set (his last match); null = full condition. Absent in pre-M3 saves. */
  conditionDate?: string | null;
  /** Domestic ban; absent in older saves. Served by club fixtures, including cups. */
  suspension?: { remaining: number; date: string };
  /**
   * Yellow cards toward a ban in `season` (SPEC §8.9), all domestic competitions; every
   * fifth is a one-match ban. Absent in older saves (they count from their next yellow).
   */
  yellows?: { season: number; count: number };
  /** Minutes and ratings since the last development update (reset at each one). */
  devTally?: DevTally;
  /**
   * The unamortised part of the fee his club paid for him, and the amount written off each
   * season (fee spread over his contract; SPEC §6.3). Null when he cost no fee.
   */
  feeBalance?: { remaining: number; perYear: number } | null;
  transfers: TransferRecord[];
  /** ISO date he became a free agent (null otherwise). */
  freeAgentSince: string | null;
  retiredSeason: number | null;
  /** On the user's transfer list (M6): AI clubs that need him bid around the asking price. */
  listed?: { asking: number; date: string };
  /** A prospect's class: the season whose draft he is in (SPEC §17.5). */
  draftSeason?: number;
  /**
   * Where he was drafted (SPEC §17.5): the season of the draft, round, overall pick, the
   * club that picked him and the club whose slot it was (absent in older saves).
   */
  draft?: { season: number; round: number; pick: number; cid: number; originalCid?: number };
}

// ---------------------------------------------------------------------------
// playerStats, fixtures, matches (filled from M2/M3)

/** Per-match player totals summed over a season (SPEC §10.1); averages are derived. */
export const PLAYER_STAT_TOTALS = [
  "minutes",
  "goals",
  "assists",
  "shots",
  "shotsOnTarget",
  "xg",
  "xa",
  "passes",
  "passesCompleted",
  "keyPasses",
  "progressivePasses",
  "crosses",
  "tackles",
  "interceptions",
  "clearances",
  "blocks",
  "aerialsWon",
  "dribbles",
  "dribblesCompleted",
  "fouls",
  "foulsWon",
  "yellowCards",
  "redCards",
  "saves",
  "goalsConceded",
] as const;
export type PlayerStatTotal = (typeof PLAYER_STAT_TOTALS)[number];

/** One player's season at one club in one competition (SPEC §10.3). */
export type PlayerStatsRow = {
  pid: number;
  season: number;
  cid: number;
  competition: string;
  appearances: number;
  starts: number;
  cleanSheets: number;
  /** Man of the match awards (SPEC §8.7). */
  motm: number;
  /** Sum of match ratings; average = ratingTotal / appearances. */
  ratingTotal: number;
} & Record<PlayerStatTotal, number>;

export interface Fixture {
  fid: number;
  season: number;
  date: string;
  slot: "weekend" | "midweek";
  /** League ID, cup ID or play-off ID (e.g. "ENG1", "ENGCUP", "ENG2-PO"). */
  competition: string;
  /** League round number ("1", "2", …) or the knockout round's name. */
  round: string;
  homeCid: number;
  awayCid: number;
  /** Finals are played at a neutral venue (no home advantage). */
  neutral: boolean;
  /** 1 or 2 in a two-legged tie; null otherwise. */
  leg: 1 | 2 | null;
  /** Set once played. */
  result: {
    /** Goals including extra time. */
    homeGoals: number;
    awayGoals: number;
    extraTime: boolean;
    /** Shoot-out score, home-away. */
    penalties: string | null;
    /** Knockout ties: the club that goes through (after the second leg in two-legged ties). */
    winnerCid: number | null;
  } | null;
}

/**
 * A played match's record (SPEC §10.4): box score, key events, team stats and player
 * ratings. No play-by-play. Kept 2 seasons, or forever when the user's club played.
 */
export interface MatchRecord {
  fid: number;
  season: number;
  date: string;
  competition: string;
  round: string;
  homeCid: number;
  awayCid: number;
  result: MatchResult;
}

// ---------------------------------------------------------------------------
// offers, transactions, inbox, awards (filled from M3/M4)

/**
 * A bid for a player (M4). `fromCid` makes it to `toCid`, the player's club (null for a
 * free agent). Open: awaiting the receiving club's answer (bids for the user's players).
 * Accepted: fee agreed, personal terms next. Completed: the player moved.
 */
export interface Offer {
  oid: number;
  pid: number;
  fromCid: number;
  toCid: number | null;
  kind: "transfer" | "loan" | "contract";
  status: "open" | "accepted" | "rejected" | "expired" | "completed";
  fee: number;
  /** Last day it stands: the window's deadline day. */
  expires: string;
  /** When it was made (absent in rows written before M4). */
  date?: string;
  season?: number;
}

/**
 * A draft pick (SPEC §17.5): a club's slot in one round of one season's draft, an asset its
 * owner can trade. Each club's picks exist for the coming draft and `picksAhead` seasons
 * after it; the draft uses them up. Keyed by season, round and original club.
 */
export interface DraftPick {
  /** The season whose draft (held the next June) it is in, as `Player.draftSeason`. */
  season: number;
  round: number;
  /** The club whose slot it is: that club's finish places it, lottery included. */
  originalCid: number;
  /** Its owner now. */
  cid: number;
  /** Its overall number in the draft, once the lottery has set the order. */
  pick?: number;
}

export interface TransactionRow {
  xid: number;
  season: number;
  date: string;
  type: TransferRecord["type"] | "renewal" | "retirement";
  pids: number[];
  cids: number[];
  /** Names at the time, so the log still reads after players are pruned. */
  names: string[];
  fee: number;
}

export interface InboxMessage {
  /** Stable player IDs with message-time names; absent in older saves. */
  players?: { pid: number; name: string }[];
  mid: number;
  date: string;
  season: number;
  kind: string;
  subject: string;
  body: string;
  read: boolean;
  /**
   * A bid for the user's player (the first of `players`): the bidding club. With the
   * player and the message date it names the offer. Absent in older saves.
   */
  bidFrom?: number;
}

export interface AwardRow {
  aid: number;
  season: number;
  competition: string;
  type: string;
  pid: number | null;
  cid: number | null;
  /** Name snapshot. */
  name: string;
}
