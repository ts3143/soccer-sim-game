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

export interface SeasonLabTeam {
  cid: number;
  name: string;
  abbr: string;
  code: string;
}

export interface SeasonLabTableRow extends SeasonLabTeam {
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

export interface SeasonLabMatch {
  fid: number;
  date: string;
  competition: string;
  competitionName: string;
  round: string;
  leg: 1 | 2 | null;
  neutral: boolean;
  home: SeasonLabTeam;
  away: SeasonLabTeam;
  /** "2–1", "1–1 aet, 4–3 pens"; null if not played yet. */
  score: string | null;
  winnerCid: number | null;
}

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

/** Contract talks with a player (renewals; transfers and free agents from M4 chunks 4–5). */
export interface ContractTalks {
  pid: number;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
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
  playGame(lid: number, option: PlayOption): PlayReport;
  getSeasonLab(lid: number): SeasonLabView;
  acceptJobOffer(lid: number, cid: number): GameState;
  getInbox(lid: number): InboxMessage[];
  markInboxRead(lid: number, mid: number): void;
  getContractTalks(lid: number, pid: number): ContractTalks;
  renewContract(lid: number, pid: number, years: number): ContractTalks;
}

export interface UiEvents {
  /** The save list changed (a league was created or deleted, in any tab). */
  leaguesChanged: { leagues: LeagueSummary[] };
  tabsChanged: { connectedTabs: number };
  /** A league's game moved on (a Play action ran, in any tab). */
  gameChanged: { lid: number; state: GameState };
}
