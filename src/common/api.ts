/**
 * The typed contract between the UI (tabs) and the game core (worker).
 *
 * WorkerApi lists every function the UI may call in the worker; UiEvents lists every
 * event the worker may push to open tabs. The UI calls through toWorker() and the
 * worker implements ApiHandlers<WorkerApi>, so any mismatch is a compile error.
 * Arguments and results must be structured-cloneable (plain data).
 */
import type { Position } from "./config/ratings";
import type { MatchEvent, MatchResult, Period } from "./match";
import type { Fixture, Foot, InboxMessage, LeagueSummary, Phase } from "./schema";

export type WorkerKind = "shared" | "dedicated";

export interface WorkerStatus {
  kind: WorkerKind;
  /** ISO date-time when this worker instance started. */
  startedAt: string;
  connectedTabs: number;
}

/** A club the user can pick on the New league screen. */
export interface ClubChoice {
  cid: number;
  code: string;
  name: string;
  leagueId: string;
  leagueName: string;
  strength: number;
  city: string;
  reputation: number;
  /** Season-1 revenue (whole euros). */
  revenue: number;
  primaryColor: string;
}

export interface NewLeagueInput {
  name: string;
  /** Empty: the worker picks a random seed. */
  seed: string;
  userCid: number;
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ClubOverviewRow {
  cid: number;
  code: string;
  name: string;
  leagueId: string;
  formation: string;
  strengthTarget: number;
  /** Mean slot OVR of the best XI, recomputed from the saved players. */
  xiStrength: number;
  seniors: number;
  academy: number;
  averageAge: number;
  /** Whole euros per year. */
  wageBill: number;
  revenue: number;
  squadCostRatio: number;
  topOvr: number;
  colors: { primary: string; secondary: string; tertiary: string };
}

/** M1 generation inspector: a summary of one saved league. */
export interface LeagueOverview {
  lid: number;
  name: string;
  seed: string;
  season: number;
  date: string;
  userCid: number;
  leagues: { id: string; name: string }[];
  counts: { clubs: number; seniors: number; academy: number; freeAgents: number };
  /** Senior club players per OVR value, ascending. */
  ovrCounts: { ovr: number; count: number }[];
  bands: { label: string; min: number; max: number; count: number }[];
  clubs: ClubOverviewRow[];
  checks: CheckResult[];
}

export interface SquadPlayerRow {
  pid: number;
  name: string;
  shirtNumber: number | null;
  position: Position;
  secondaryPositions: Position[];
  age: number;
  nationality: string;
  nationality2: string | null;
  foot: Foot;
  heightCm: number;
  ovr: number;
  pot: number;
  /** Whole euros per year; null for academy players. */
  wage: number | null;
  contractExpires: string | null;
  status: "club" | "academy";
  /** Best-XI slot, e.g. "FB R"; null if not in the XI. */
  xiSlot: string | null;
  slotOvr: number | null;
}

export interface SquadView {
  cid: number;
  code: string;
  name: string;
  leagueId: string;
  formation: string;
  strengthTarget: number;
  xiStrength: number;
  colors: { primary: string; secondary: string; tertiary: string };
  players: SquadPlayerRow[];
}

// ---------------------------------------------------------------------------
// M2 Match lab (developer-only page)

export interface LabMatchSetup {
  lid: number;
  homeCid: number;
  awayCid: number;
  seed: string;
}

export interface LabTeam {
  cid: number;
  name: string;
  code: string;
  abbr: string;
  formation: string;
  sliders: { mentality: number; pressing: number; directness: number };
}

export interface LabMatch {
  seed: string;
  home: LabTeam;
  away: LabTeam;
  /** Player names and positions for the box score and feed. */
  players: Record<number, { name: string; shirtNumber: number | null }>;
  result: MatchResult;
}

export interface LabLiveStart {
  id: number;
  seed: string;
  home: LabTeam;
  away: LabTeam;
  players: Record<number, { name: string; shirtNumber: number | null }>;
}

export interface LabLiveStep {
  events: MatchEvent[];
  clock: number;
  period: Period;
  score: [number, number];
  finished: boolean;
  result: MatchResult | null;
  /** When finished: whether stepping gave the identical result to an instant sim. */
  identicalToInstant: boolean | null;
}

export interface LabBatchRow {
  metric: string;
  value: number;
  target: number;
  low: number;
  high: number;
  pass: boolean;
}

export interface LabBatch {
  matches: number;
  msPerMatch: number;
  rows: LabBatchRow[];
}

// ---------------------------------------------------------------------------
// Season loop (M3): the Play menu

/** Play-menu actions (SPEC §3.2), as the worker runs them. */
export type PlayOption =
  | "untilNextMatch"
  | "oneWeek"
  | "untilWindowCloses"
  | "untilEndOfSeason"
  | "proceedToPromotionRelegation"
  | "advanceToPreseason";

export type SeasonEventKind = "windowOpens" | "windowCloses" | "winterUpdate" | "deadlineReminder";

export interface SeasonEvent {
  date: string;
  kind: SeasonEventKind;
  /** Window ID for window events. */
  window?: string;
}

export interface GameState {
  season: number;
  phase: Phase;
  date: string;
  /** The transfer window open on the game date, if any. */
  window: { id: string; closes: string } | null;
  options: PlayOption[];
  /** The user's next fixture, if one is scheduled. */
  nextUserFixture: Fixture | null;
  /** Set when the board has sacked the user: play stops until he takes a job offer. */
  fired: { date: string; offers: { cid: number; name: string; leagueId: string }[] } | null;
}

/** Win, draw or loss, for form guides. */
export type FormResult = "W" | "D" | "L";

/** The Dashboard (M5, SPEC §11): the user's club at a glance. */
export interface DashboardView {
  user: TeamRef & { leagueId: string; leagueName: string };
  position: number | null;
  record: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  /** Last five results, oldest first, in every competition. */
  form: FormResult[];
  nextMatch: (MatchView & { opponentPosition: number | null; opponentForm: FormResult[] }) | null;
  upcoming: MatchView[];
  recent: MatchView[];
  /** The user's league table. */
  table: TableRowView[];
  board: { target: string; confidence: number | null };
  alerts: {
    injured: { pid: number; name: string; position: string; type: string; until: string }[];
    tired: { pid: number; name: string; position: string; condition: number }[];
    /** Players whose contracts end this 30 June. */
    expiring: number;
    /** Open bids for the user's players. */
    bids: number;
  };
  /** The user's best performers this season (by average rating, 3+ appearances). */
  topPlayers: {
    pid: number;
    name: string;
    position: string;
    appearances: number;
    goals: number;
    assists: number;
    rating: number;
  }[];
  inbox: InboxMessage[];
  unread: number;
  cash: number;
}

/** What the app shell needs for an open league (M5): names, clubs, leagues, the game state. */
export interface LeagueShell {
  lid: number;
  name: string;
  userCid: number;
  /** The first season of every save (season pickers run from it to the current one). */
  firstSeason: number;
  clubs: {
    cid: number;
    name: string;
    short: string;
    abbr: string;
    code: string;
    leagueId: string;
    colors: { primary: string; secondary: string; tertiary: string };
  }[];
  leagues: { id: string; name: string }[];
  state: GameState;
  /** Unread inbox messages. */
  unread: number;
}

export interface PlayReport {
  from: string;
  to: string;
  matchesPlayed: number;
  events: SeasonEvent[];
  phase: Phase;
}

// ---------------------------------------------------------------------------
// Season lab (M3 developer page; the game screens replace it in M5)

export type TableZone = "champions" | "promoted" | "playoffs" | "relegated" | null;

/** A club as pages show it (crest code, names). */
export interface TeamRef {
  cid: number;
  name: string;
  abbr: string;
  code: string;
}

/** One row of a league table, with its zone. */
export interface TableRowView extends TeamRef {
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  zone: TableZone;
}

/** A fixture as pages show it. */
export interface MatchView {
  fid: number;
  date: string;
  competition: string;
  competitionName: string;
  round: string;
  leg: 1 | 2 | null;
  neutral: boolean;
  home: TeamRef;
  away: TeamRef;
  /** "2–1", "1–1 aet, 4–3 pens"; null if not played yet. */
  score: string | null;
  winnerCid: number | null;
}

export type SeasonLabTeam = TeamRef;
export type SeasonLabTableRow = TableRowView;
export type SeasonLabMatch = MatchView;

export interface SeasonLabKnockout {
  id: string;
  name: string;
  rounds: { name: string; date: string | null; matches: SeasonLabMatch[] }[];
  winner: SeasonLabTeam | null;
}

export interface SeasonLabView {
  lid: number;
  state: GameState;
  user: SeasonLabTeam & { leagueId: string };
  /** The user's club: board target and confidence, hype, reputation, cash. */
  club: {
    target: string;
    confidence: number;
    hype: number;
    reputation: number;
    cash: number;
    revenue: number;
    expenses: number;
  };
  /** The latest inbox messages, newest first. */
  inbox: { mid: number; date: string; subject: string; body: string; read: boolean }[];
  nextUserMatch: SeasonLabMatch | null;
  leagues: { id: string; name: string; rows: SeasonLabTableRow[] }[];
  /** The last matchday played (all its matches). */
  latest: { date: string; matches: SeasonLabMatch[] } | null;
  cups: SeasonLabKnockout[];
  playoffs: SeasonLabKnockout[];
  injuries: {
    total: number;
    perSquad: number;
    user: { name: string; position: string; type: string; until: string }[];
    mostByClub: { team: SeasonLabTeam; count: number }[];
  };
  /** This season's awards and honours (from the final whistle). */
  awards: {
    competition: string;
    competitionName: string;
    type: string;
    name: string;
    club: string;
  }[];
  transactions: {
    counts: Record<string, number>;
    recent: { date: string; type: string; text: string }[];
  };
  academy: {
    total: number;
    intakeThisSeason: number;
    topProspects: { name: string; club: string; age: number; ovr: number; pot: number }[];
  };
}

/**
 * Talks with a player: a renewal (one of the user's), a transfer (personal terms once his
 * club accepts a fee) or a free agent. Mood and asks are toward the user's club.
 */
export interface ContractTalks {
  pid: number;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  kind: "renewal" | "transfer" | "freeAgent";
  /** His club's name (null for a free agent). */
  club: string | null;
  wage: number;
  expires: string | null;
  yearsLeft: number;
  /** Market value in euros. */
  value: number;
  mood: { value: number; components: Record<string, number>; willing: boolean };
  /** Wage asked per contract length (1–5 years) and the end date it gives. */
  asks: { years: number; wage: number; expires: string }[];
  windowOpen: boolean;
  userPlayer: boolean;
  /** Transfer: the fee his club accepted (null until a bid is accepted). */
  feeAgreed: number | null;
  /**
   * The user's transfer budget and wage room (a year) now (SPEC §6.3), his squad cost as a
   * share of revenue against the FFP limit, and any FFP warning or ban (SPEC §6.4).
   */
  budget: {
    transfer: number;
    wageRoom: number;
    squadCostRatio: number;
    ffpLimit: number;
    warned: boolean;
    bannedUntil: string | null;
  };
}

/** A club's answer to the user's bid. */
export interface BidReply {
  outcome: "accepted" | "countered" | "rejected";
  fee: number;
  /** The club's asking price when it counters. */
  counter: number | null;
  message: string;
  talks: ContractTalks;
}

/** M4 Club lab (developer-only): one club's money, FFP, board and market standing. */
export interface ClubLabClubRow {
  cid: number;
  name: string;
  code: string;
  leagueId: string;
  user: boolean;
  cash: number;
  /** Last season's operating revenue (this season's budgets are costed on it). */
  budgetBase: number;
  /** This season so far: operating revenue and cash expenses. */
  revenue: number;
  expenses: number;
  /** A year, now: wages and transfer-fee amortisation. */
  wages: number;
  amortisation: number;
  /** Squad cost over the budget base now, and last season's FFP ratio. */
  squadCostRatio: number;
  lastSquadCostRatio: number | null;
  ffp: "ok" | "warned" | "banned";
  strategy: "contending" | "developing" | "selling";
  boardTarget: string | null;
  confidence: number | null;
  transferBudget: number;
  wageRoom: number;
  seniors: number;
  loansIn: number;
  loansOut: number;
}

/** One of the user's players (contracted, loaned out, or on loan to him). */
export interface ClubLabPlayer {
  pid: number;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  status: string;
  /** Loan: "to <club> until <date>" or "from <club> until <date>". */
  loan: string | null;
  wage: number;
  expires: string | null;
  yearsLeft: number;
  value: number;
  mood: number;
  willing: boolean;
  /** Unamortised transfer fee. */
  feeRemaining: number;
}

export interface ClubLabView {
  date: string;
  season: number;
  window: { id: string; closes: string } | null;
  fired: boolean;
  user: {
    cid: number;
    name: string;
    code: string;
    budget: ContractTalks["budget"];
    /** The budget control: share of FFP headroom kept for wages (SPEC §6.3). */
    wageShare: number;
  };
  clubs: ClubLabClubRow[];
  squad: ClubLabPlayer[];
  offers: OfferView[];
  /** This season's transfers, signings, loans, renewals and releases, newest first. */
  transfers: { date: string; type: string; text: string; fee: number }[];
  inbox: InboxMessage[];
}

/** A market search in the Club lab. */
export interface PlayerSearch {
  position?: string;
  minOvr?: number;
  maxOvr?: number;
  maxAge?: number;
  freeAgents?: boolean;
  limit?: number;
}

export interface PlayerSearchRow {
  pid: number;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  club: string | null;
  cid: number | null;
  status: string;
  value: number;
  wage: number;
  expires: string | null;
  /** Free agents: days unsigned. */
  daysFree: number | null;
}

/** An AI club's answer to a loan the user proposed. */
export interface LoanReply {
  accepted: boolean;
  message: string;
}

/** A bid by or for the user's club this season. */
export interface OfferView {
  oid: number;
  pid: number;
  name: string;
  from: string;
  to: string;
  fee: number;
  status: "open" | "accepted" | "rejected" | "expired" | "completed";
  /** The day the window closes; the bid lapses once that day is played. */
  expires: string;
  /** A bid for one of the user's players. */
  incoming: boolean;
}

export interface WorkerApi {
  getStatus(): WorkerStatus;
  listLeagues(): LeagueSummary[];
  getClubChoices(): ClubChoice[];
  createLeague(input: NewLeagueInput): LeagueSummary;
  deleteLeague(lid: number): void;
  getLeagueOverview(lid: number): LeagueOverview;
  getSquad(lid: number, cid: number): SquadView;
  simulateLabMatch(setup: LabMatchSetup): LabMatch;
  startLabMatch(setup: LabMatchSetup): LabLiveStart;
  stepLabMatch(id: number, possessions: number): LabLiveStep;
  runLabBatch(lid: number, matches: number): LabBatch;
  getGameState(lid: number): GameState;
  getLeagueShell(lid: number): LeagueShell;
  getDashboard(lid: number): DashboardView;
  markAllInboxRead(lid: number): void;
  playGame(lid: number, option: PlayOption): PlayReport;
  getSeasonLab(lid: number): SeasonLabView;
  acceptJobOffer(lid: number, cid: number): GameState;
  getInbox(lid: number): InboxMessage[];
  markInboxRead(lid: number, mid: number): void;
  getContractTalks(lid: number, pid: number): ContractTalks;
  renewContract(lid: number, pid: number, years: number): ContractTalks;
  bidForPlayer(lid: number, pid: number, fee: number): BidReply;
  signPlayer(lid: number, pid: number, years: number): ContractTalks;
  getOffers(lid: number): OfferView[];
  respondToOffer(lid: number, oid: number, accept: boolean): OfferView[];
  /** Loan a player out (to `cid`) or in (`cid` = your club); `wageShare`: the loan club's. */
  proposeLoan(
    lid: number,
    pid: number,
    cid: number,
    length: "half" | "season",
    wageShare: number,
  ): LoanReply;
  getClubLab(lid: number): ClubLabView;
  searchPlayers(lid: number, query: PlayerSearch): PlayerSearchRow[];
  /** The budget control (SPEC §6.3): 0 = all headroom for fees, 1 = all for wages. */
  setWageShare(lid: number, share: number): ClubLabView;
}

export interface UiEvents {
  /** The save list changed (a league was created or deleted, in any tab). */
  leaguesChanged: { leagues: LeagueSummary[] };
  tabsChanged: { connectedTabs: number };
  /** A league's game moved on (a Play action ran, in any tab). */
  gameChanged: { lid: number; state: GameState };
}
