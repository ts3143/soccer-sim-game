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

/** Season phases (SPEC §3.1). There is no re-sign phase: renewals happen in windows. */
export type Phase = "preseason" | "regularSeason" | "playoffs" | "endOfSeason";

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

export interface MetaRows {
  game: GameMeta;
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
  /** Between-match condition, 0–100. */
  condition: number;
  transfers: TransferRecord[];
  /** ISO date he became a free agent (null otherwise). */
  freeAgentSince: string | null;
  retiredSeason: number | null;
}

// ---------------------------------------------------------------------------
// playerStats, fixtures, matches (filled from M2/M3)

export interface PlayerStatsRow {
  pid: number;
  season: number;
  cid: number;
  competition: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  /** Further per-match totals (SPEC §10.1) are added by the match engine. */
  [stat: string]: number | string;
}

export interface Fixture {
  fid: number;
  season: number;
  date: string;
  slot: "weekend" | "midweek";
  competition: string;
  round: string;
  homeCid: number;
  awayCid: number;
  /** Set once played. */
  result: {
    homeGoals: number;
    awayGoals: number;
    extraTime: boolean;
    penalties: string | null;
  } | null;
}

export interface MatchRecord {
  fid: number;
  season: number;
  /** Box score, scoring summary, key events, team stats, player ratings: shaped in M2. */
  data: unknown;
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
