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
export type Phase = "preseason" | "regularSeason" | "endOfSeason";

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
}

export interface MetaRows {
  game: GameMeta;
  /** Absent in saves made before M3 until the season is first set up. */
  season: SeasonMeta;
  ids: IdCounters;
  /** Saved state of the league's main random stream. */
  rng: { seed: string; words: readonly [number, number, number, number] };
  /** World-size config and per-league modifiers in force for this save. */
  world: { leagues: string[]; styleModifiers: Record<string, StyleModifiersRow> };
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

/**
 * A club's saved tactics. AI clubs' are picked by the AI before each match; the user's
 * apply to the matches he watches (simulated matches: the AI manages his club too).
 */
export interface Tactics {
  formation: string;
  sliders: SliderSettings;
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
  /** Current cash in whole euros (season-end snapshots go in clubSeasons). */
  cash: number;
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
  squadCostRatio: number | null;
}

// ---------------------------------------------------------------------------
// players

export type CurveType = "normal" | "early" | "late" | "ageless";
export type MoodTrait = "fame" | "loyalty" | "money" | "winning";
export type PlayerStatus = "club" | "academy" | "loan" | "freeAgent" | "retired";
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

export interface TransferRecord {
  date: string;
  season: number;
  fromCid: number | null;
  toCid: number | null;
  fee: number;
  type: "transfer" | "loan" | "freeAgent" | "academyPromotion" | "release";
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
  /**
   * Between-match condition, 0–100, as of `conditionDate`. It recovers with rest from
   * then on (src/worker/season/squads.ts works out today's value).
   */
  condition: number;
  /** Date `condition` was set (his last match); null = full condition. Absent in pre-M3 saves. */
  conditionDate?: string | null;
  /** Minutes and ratings since the last development update (reset at each one). */
  devTally?: DevTally;
  transfers: TransferRecord[];
  /** ISO date he became a free agent (null otherwise). */
  freeAgentSince: string | null;
  retiredSeason: number | null;
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

export interface Offer {
  oid: number;
  pid: number;
  fromCid: number;
  toCid: number | null;
  kind: "transfer" | "loan" | "contract";
  status: "open" | "accepted" | "rejected" | "expired";
  fee: number;
  expires: string;
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
  mid: number;
  date: string;
  season: number;
  kind: string;
  subject: string;
  body: string;
  read: boolean;
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
