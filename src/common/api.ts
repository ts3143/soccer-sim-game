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
import type { Foot, LeagueSummary } from "./schema";

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
}

export interface UiEvents {
  /** The save list changed (a league was created or deleted, in any tab). */
  leaguesChanged: { leagues: LeagueSummary[] };
  tabsChanged: { connectedTabs: number };
}
