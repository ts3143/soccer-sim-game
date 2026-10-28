/**
 * The typed contract between the UI (tabs) and the game core (worker).
 *
 * WorkerApi lists every function the UI may call in the worker; UiEvents lists every
 * event the worker may push to open tabs. The UI calls through toWorker() and the
 * worker implements ApiHandlers<WorkerApi>, so any mismatch is a compile error.
 * Arguments and results must be structured-cloneable (plain data).
 */
import type { Position } from "./config/ratings";
import type { WorldId, WorldSwitches } from "./config/worlds";
import type { MatchEvent, MatchResult, Period } from "./match";
import type {
  Fixture,
  InboxMessage,
  LeagueSummary,
  Phase,
  SliderSettings,
  TradeAssets,
} from "./schema";

export type { TradeAssets };

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
  /** The world to play in (SPEC §17.1). */
  world: WorldId;
  name: string;
  /** Empty: the worker picks a random seed. */
  seed: string;
  userCid: number;
}

// ---------------------------------------------------------------------------
// Season loop (M3): the Play menu

/** Play-menu actions (SPEC §3.2), as the worker runs them. */
export type PlayOption =
  | "untilNextMatch"
  | "watchNextMatch"
  | "oneWeek"
  | "untilWindowCloses"
  | "untilEndOfSeason"
  | "proceedToPromotionRelegation"
  | "untilDraftLottery"
  | "untilDraft"
  | "untilYourPick"
  | "untilEndOfDraft"
  | "untilResigning"
  | "advanceToPreseason";

export type SeasonEventKind =
  "windowOpens" | "windowCloses" | "winterUpdate" | "deadlineReminder" | "academyReminder";

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
  /**
   * In a world with trades (SPEC §17.6): whether they're open on the game date, and to
   * when (the roster deadline, or 30 June after the play-offs); closed, they reopen when
   * the play-offs end. Null in a world with transfers.
   */
  trades: { open: boolean; until: string | null } | null;
  options: PlayOption[];
  /** The user's next fixture, if one is scheduled. */
  nextUserFixture: Fixture | null;
  /** Set when the board has sacked the user: play stops until he takes a job offer. */
  fired: { date: string; offers: { cid: number; name: string; leagueId: string }[] } | null;
  /** Set while the user watches a match live (M6): play waits until it ends. */
  live: { fid: number } | null;
  /**
   * Why Play waits for the user, in plain words: his squad over the limit at the first
   * league match (SPEC §17.4). Null otherwise.
   */
  blocked: string | null;
  /** The Play action under way (started in any tab), or null. */
  playing: PlayOption | null;
}

/** A league table row on the Standings page (form and home/away only for the live season). */
export interface StandingsRow extends TableRowView {
  form: FormResult[] | null;
  /** "W-D-L" at home and away. */
  home: string | null;
  away: string | null;
  /**
   * In a world with a draft, the live table's chance at the first pick (%) if the season
   * ended today (SPEC §17.5); null outside the lottery pool; absent otherwise.
   */
  lotteryOdds?: number | null;
}

export interface StandingsView {
  leagueId: string;
  leagueName: string;
  season: number;
  /** The season being played (live table), or a finished one (final positions). */
  current: boolean;
  rows: StandingsRow[];
  /** What each coloured zone means in this league. */
  zones: { zone: Exclude<TableZone, null>; label: string }[];
  /** A finished season's outcome: champions, promoted, play-off winners, relegated. */
  notes: string[];
}

/** One knockout tie (one match, or two legs) on the Cups page. */
export interface CupTie {
  home: TeamRef;
  away: TeamRef;
  legs: MatchView[];
  /** Two-legged ties: the aggregate, e.g. "3–2". */
  aggregate: string | null;
  winner: TeamRef | null;
}

export interface CupView {
  id: string;
  name: string;
  season: number;
  /** Every knockout competition (cups and play-offs), for the tabs. */
  competitions: { id: string; name: string }[];
  rounds: { name: string; date: string | null; ties: CupTie[] }[];
  winner: TeamRef | null;
  /**
   * A league play-off not drawn yet this season: its first round if the season ended
   * today, from the live table (each club with its position). Null otherwise.
   */
  projection: {
    round: string;
    ties: { home: TeamRef & { position: number }; away: TeamRef & { position: number } }[];
  } | null;
}

/** The Weekly Schedule: one week's fixtures in every competition (weeks run Monday–Sunday). */
export interface ScheduleView {
  season: number;
  weeks: { start: string; end: string; matches: number }[];
  /** Start (Monday) of the week shown. */
  week: string;
  matches: MatchView[];
}

/** One player on the Squad page. */
export interface SquadPlayerView {
  listed: { asking: number; date: string } | null;
  ovrChange: number | null;
  potChange: number | null;
  ratings: number[];
  suspension: number;
  pid: number;
  name: string;
  shirtNumber: number | null;
  position: Position;
  secondary: string[];
  age: number;
  nationality: string;
  foot: string;
  ovr: number;
  pot: number;
  /** club, academy, loan (here on loan) or loanedOut (his contract is here, he plays elsewhere). */
  status: "club" | "academy" | "loan" | "loanedOut";
  loan: string | null;
  condition: number;
  injury: { type: string; until: string } | null;
  wage: number | null;
  expires: string | null;
  /** His contract ends this 30 June (SPEC §11: the expiry badge). */
  expiring: boolean;
  value: number;
  /** Mood toward his club (−1 to 1); null for academy players. */
  mood: number | null;
  /**
   * In a world with a re-signing period (SPEC §17.6): an expiring player of the user's
   * club would talk about a new contract; null otherwise.
   */
  willing: boolean | null;
  season: { appearances: number; goals: number; assists: number; rating: number | null };
}

export interface TeamSquadView {
  team: TeamRef & { leagueId: string; leagueName: string; position: number | null };
  formation: string;
  /** Mean OVR of the best fit XI. */
  strength: number;
  averageAge: number;
  /** A year, for the players whose contracts the club holds. */
  wageBill: number;
  players: SquadPlayerView[];
  academy: SquadPlayerView[];
  loanedOut: SquadPlayerView[];
}

/** The player profile (SPEC §11). */
export interface PlayerView {
  ovrChange: number | null;
  potChange: number | null;
  pid: number;
  name: string;
  position: Position;
  secondary: string[];
  age: number;
  birthDate: string;
  /** His home town (T, 2026-10-25); null when the name data had none. */
  birthplace: string | null;
  nationality: string;
  nationality2: string | null;
  foot: string;
  heightCm: number;
  shirtNumber: number | null;
  ovr: number;
  pot: number;
  status: string;
  team: TeamRef | null;
  /** On loan: where he plays and his parent club. */
  loan: { at: TeamRef; parent: TeamRef; until: string; wageShare: number } | null;
  contract: { wage: number; expires: string; yearsLeft: number; feeRemaining: number } | null;
  value: number;
  mood: {
    value: number;
    willing: boolean;
    components: Record<string, number>;
    traits: string[];
  } | null;
  condition: number;
  injury: { type: string; until: string } | null;
  ratings: { code: string; name: string; group: string; value: number; change: number | null }[];
  positionOvrs: { position: Position; ovr: number }[];
  transfers: {
    date: string;
    type: string;
    from: TeamRef | null;
    to: TeamRef | null;
    fee: number;
  }[];
  freeAgentSince: string | null;
  /** Where he was drafted (SPEC §17.5): null if he wasn't. */
  drafted: {
    season: number;
    round: number;
    pick: number;
    club: TeamRef;
    /** The club whose slot it was, when it wasn't the picking club's own. */
    from: TeamRef | null;
  } | null;
  /** On the user's transfer list (his own players only). */
  listed: { asking: number; date: string } | null;
  /** The game date (for what a release would cost). */
  today: string;
  retiredSeason: number | null;
  /** Every development update: OVR and POT over time. */
  history: {
    date: string;
    season: number;
    age: number;
    ovr: number;
    pot: number;
    ratings: number[];
  }[];
  /** The profile radar (config `radarAxes`): each axis is the mean of its ratings. */
  radar: { axis: string; value: number }[];
  /** Season rows per club and competition, oldest first. */
  career: {
    season: number;
    club: TeamRef;
    competition: string;
    competitionName: string;
    appearances: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    rating: number | null;
    /** Man of the match awards. */
    motm: number;
    yellowCards: number;
    redCards: number;
    cleanSheets: number;
  }[];
  /**
   * His honours, oldest first: his awards, and his club's titles, cups and promotions in
   * seasons he played in that competition for it (T, 2026-10-25).
   */
  honours: {
    season: number;
    type: HonourType;
    competition: string;
    competitionName: string;
    club: TeamRef;
  }[];
  /** His injuries since `injuriesSince`, newest first (T, 2026-10-25). */
  injuries: {
    date: string;
    type: string;
    /** Days out, as expected when it happened. */
    days: number;
    /** In a match: its fixture and the opponent; null for a training injury. */
    fid: number | null;
    opponent: TeamRef | null;
  }[];
  /** Since when injuries are recorded: the league's start, or an older save's upgrade. */
  injuriesSince: string;
  /** His last five matches this season, newest first, from his club's side. */
  form: (ClubMatchView & {
    rating: number;
    minutes: number;
    goals: number;
    assists: number;
    motm: boolean;
  })[];
}

/** A box score page: the fixture, and the saved match record if it's still kept. */
export interface BoxScoreView {
  match: MatchView;
  /** null: not played yet, or the record was pruned (other clubs' matches are kept 2 seasons). */
  result: MatchResult | null;
  players: Record<number, { name: string; shirtNumber: number | null }>;
}

/** A club's season of matches (Game Log). */
/** One match from a club's side: a Game Log row, a form entry. */
export interface ClubMatchView {
  match: MatchView;
  venue: "H" | "A" | "N";
  opponent: TeamRef;
  result: FormResult | null;
}

export interface GameLogView {
  team: TeamRef;
  season: number;
  matches: ClubMatchView[];
  record: { won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number };
}

/** League Leaders: the top ten in each category, one league and season. */
export interface LeagueLeadersView {
  leagueId: string;
  leagueName: string;
  season: number;
  categories: {
    key: string;
    label: string;
    /** e.g. "min. 8 appearances" for the rating category. */
    note: string | null;
    rows: { pid: number; name: string; club: TeamRef; value: number; display: string }[];
  }[];
}

/** Player Ratings: every active player and free agent with his 22 ratings. */
export interface PlayerRatingsView {
  codes: { code: string; name: string }[];
  rows: {
    pid: number;
    name: string;
    nationality: string;
    club: TeamRef | null;
    leagueId: string | null;
    status: string;
    position: string;
    age: number;
    ovr: number;
    pot: number;
    /** In `codes` order. */
    ratings: number[];
  }[];
}

/** Player Stats: one row per player and club for a season (all or one competition). */
export interface PlayerStatsView {
  season: number;
  competition: string | null;
  competitions: { id: string; name: string }[];
  rows: {
    pid: number;
    name: string;
    club: TeamRef;
    leagueId: string;
    position: string;
    age: number;
    appearances: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    xg: number;
    xa: number;
    shots: number;
    shotsOnTarget: number;
    keyPasses: number;
    passes: number;
    passesCompleted: number;
    tackles: number;
    interceptions: number;
    yellowCards: number;
    redCards: number;
    saves: number;
    cleanSheets: number;
    rating: number | null;
    /** Man of the match awards. */
    motm: number;
  }[];
}

/** Team Stats: each club's season in its league, from the saved match records. */
export interface TeamStatsView {
  leagueId: string;
  leagueName: string;
  season: number;
  /** False when the season's match records have been pruned (only results remain). */
  detailed: boolean;
  rows: {
    team: TeamRef;
    played: number;
    goalsFor: number;
    goalsAgainst: number;
    xgFor: number | null;
    xgAgainst: number | null;
    shotsFor: number | null;
    shotsAgainst: number | null;
    possession: number | null;
    passAccuracy: number | null;
    corners: number | null;
    fouls: number | null;
    yellowCards: number | null;
    redCards: number | null;
    cleanSheets: number | null;
  }[];
}

/** A line-up on the Tactics page (M6): formation, the XI by slot, the bench, the sliders. */
export interface TacticsSetup {
  formation: string;
  sliders: SliderSettings;
  /** Player ID per formation slot (11); null = empty. */
  slots: (number | null)[];
  /** Substitutes in order (up to the bench size). */
  bench: number[];
}

/**
 * How a setup is taken: as given, re-slotted into its formation, the AI's pick, or the
 * user's saved line-up again.
 */
export type TacticsMode = "asIs" | "reslot" | "auto" | "saved";

export interface TacticsPlayerView {
  listed: { asking: number; date: string } | null;
  expires: string | null;
  expiring: boolean;
  ovrChange: number | null;
  potChange: number | null;
  nationality: string;
  ratings: number[];
  pot: number;
  suspension: number;
  today: string;
  season: {
    appearances: number;
    minutes: number;
    goals: number;
    assists: number;
    rating: number | null;
  };
  pid: number;
  name: string;
  position: Position;
  secondary: Position[];
  age: number;
  ovr: number;
  /** OVR in the slot he fills (wrong foot counted); on the bench and in reserve, his OVR. */
  slotOvr: number;
  /** His OVR in each slot of the formation shown (wrong foot counted): where he'd fit. */
  slotOvrs: number[];
  /** His OVR at his best position. */
  bestOvr: number;
  condition: number;
  injury: { type: string; until: string } | null;
  academy: boolean;
  loanee: boolean;
}

/** The Tactics page: a club's line-up, who else can play, and the team ratings it gives. */
export interface TacticsView {
  team: TeamRef;
  /** The user's club (other clubs show the AI's pick, read-only). */
  editable: boolean;
  /** The user has saved a line-up (otherwise this is the AI's pick). */
  saved: boolean;
  /** The setup shown, cleaned of players who can't play for the club any more. */
  setup: TacticsSetup;
  slots: { label: string; position: Position; player: TacticsPlayerView | null }[];
  bench: TacticsPlayerView[];
  /** Everyone else who can be picked (seniors, loanees in, academy players 16+). */
  reserves: TacticsPlayerView[];
  /**
   * Before a live match: who can't play in it (injured, suspended) and isn't in the
   * line-up, shown but not pickable.
   */
  unavailable?: TacticsPlayerView[];
  /**
   * Before a live match: why this line-up can't kick off (T, 2026-10-25): a player in it
   * who can't play today, or an empty slot. Empty: it can.
   */
  cantStart?: string[];
  /** The seven team ratings (player-OVR scale) at today's condition, sliders included. */
  ratings: { key: string; label: string; value: number }[];
  warnings: string[];
  benchSize: number;
}

/** One side of a live match (M6 Watch live). */
export interface LiveTeamView {
  team: TeamRef;
  formation: string;
  sliders: SliderSettings;
  /** Managed by the user (he makes its changes) or by the AI. */
  user: boolean;
  stats: {
    shots: number;
    shotsOnTarget: number;
    xg: number;
    /** Share of the time with the ball so far, 0–1. */
    possession: number;
    passes: number;
    passesCompleted: number;
    corners: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  };
  /** The 11 slots: who plays there now (null after a red card). */
  onPitch: ({
    pid: number;
    slot: string;
    /** In-match energy, 0–100. */
    energy: number;
    booked: boolean;
    injured: boolean;
    injuryDays: number;
  } | null)[];
  /** Substitutes still available. */
  bench: { pid: number; position: Position; energy: number }[];
  subsUsed: number;
  subLimit: number;
  windowsUsed: number;
  windowLimit: number;
}

/** A match the user is watching live (M6). */
export interface LiveMatchView {
  fid: number;
  date: string;
  competition: string;
  competitionName: string;
  round: string;
  leg: number | null;
  /** The user's side: 0 home, 1 away. */
  userSide: 0 | 1;
  score: [number, number];
  shootout: [number, number] | null;
  clock: number;
  minute: number;
  period: Period;
  /** Before kick-off or at a break: substitutions now don't use a window. */
  atBreak: boolean;
  finished: boolean;
  /** Feed events from the index asked for, and how many the feed holds now. */
  events: MatchEvent[];
  feedLength: number;
  teams: [LiveTeamView, LiveTeamView];
  /** Names of everyone in both squads. */
  players: Record<
    number,
    { name: string; position: Position; shirtNumber: number | null; ovr: number }
  >;
  /** Why the last step stopped by itself (auto-pause), if it did. */
  pause: LivePause | null;
  /** At full time: the match is saved and the day finished. */
  report: PlayReport | null;
  /** At full time: the man of the match (SPEC §8.7) and his rating. */
  motm: { pid: number; rating: number } | null;
}

/**
 * Play stops by itself at a break (half-time, before extra time, extra time's half-time)
 * and when one of the user's players is injured or sent off.
 */
export interface LivePause {
  reason: "halfTime" | "extraTime" | "extraTimeBreak" | "injury" | "redCard";
  /** The player injured or sent off. */
  pid: number | null;
}

/** Changes the user makes at a pause in a live match (subs, formation, positions, sliders). */
export interface LiveChanges {
  subs?: { outPid: number; inPid: number }[];
  formation?: string;
  /**
   * Who plays where after the subs and any formation change: a pid per slot, null for a
   * slot left empty (down to ten). Moving players around the pitch is free (T, 2026-10-21).
   */
  slots?: (number | null)[];
  sliders?: Partial<SliderSettings>;
}

/** How a player's match is going, for the live tactics board. */
export interface LiveBoardMatch {
  /** In-match energy, 0–100. */
  energy: number;
  booked: boolean;
  injured: boolean;
  injuryDays: number;
  minutes: number;
  goals: number;
  assists: number;
  /** Match rating so far, at the current score; null before he has played. */
  rating: number | null;
}

/**
 * The tactics board at a pause in a live match (T, 2026-10-21): the user's side as the
 * Tactics editor shows it (slots, the substitutes left on the bench, team ratings now,
 * energy counted), plus each player's match so far. No reserves: only the bench can come on.
 */
export interface LiveBoardView extends TacticsView {
  /** By pid: everyone on the pitch or the bench. */
  match: Record<number, LiveBoardMatch>;
  subsLeft: number;
  windowsLeft: number;
  /** At a break, substitutions use no window. */
  free: boolean;
}

/** The Free Agents page (M6): every unsigned player, his ask and his mood toward the user's club. */
/**
 * A club's payroll against its soft cap (SPEC §17.7), in a world with one: what it may
 * still spend on free agents, and the luxury tax if the season ended today.
 */
export interface CapView {
  /** Wages of the players under contract plus those owed to released players, a year. */
  payroll: number;
  cap: number;
  /** Cap less payroll: negative when over. */
  room: number;
  minimumWage: number;
  /** The most a free agent's wage can be now: the room, or the minimum wage over the cap. */
  freeAgentRoom: number;
  /** The luxury tax on this payroll if the season ended today. */
  taxIfEnded: number;
  /** Tax per euro over the cap. */
  taxRate: number;
  /** Over the cap, a trade may bring back at most this times the wages sent out. */
  tradeMatching: number;
  /** A relegated club's grace: its old league's cap, through this season. */
  grace: { league: string; through: number } | null;
}

export interface FreeAgentsView {
  rows: {
    pid: number;
    name: string;
    nationality: string;
    position: Position;
    secondary: Position[];
    age: number;
    ovr: number;
    pot: number;
    value: number;
    /** His lowest yearly wage ask (over 1–5 years) at the user's club. */
    ask: number;
    mood: number;
    /** He would negotiate with the user's club. */
    willing: boolean;
    daysFree: number;
  }[];
  /** The user's wage room (a year) now; under a soft cap, his free-agent room. */
  wageRoom: number;
  seniors: number;
  maxSeniors: number;
  /** The squad limit counts now (in the Super League from the first league match). */
  limitCounts: boolean;
  windowOpen: boolean;
  /** Where free agency has its own dates (SPEC §17.6): why it's closed now, else null. */
  closed: string | null;
  /** The soft cap (null in a world without one). */
  cap: CapView | null;
  /** FFP transfer ban until this date, if any. */
  banned: string | null;
  fired: boolean;
}

/** The Transfer Market page (M6): your squad for listing, offers, loans, and what you owe. */
export interface TransferMarketView {
  date: string;
  window: { id: string; closes: string } | null;
  budget: {
    transfer: number;
    wageRoom: number;
    seniors: number;
    maxSeniors: number;
    squadCostRatio: number;
    ffpLimit: number;
    banned: string | null;
    /** Cash below zero: transfer fees are frozen until it's back above zero (SPEC §6.4). */
    cashFrozen: boolean;
    /** Wages still owed a year to released players. */
    owed: number;
  };
  /** The user's seniors (loanees in left out), with their listing and open bids for them. */
  squad: {
    pid: number;
    name: string;
    position: Position;
    age: number;
    ovr: number;
    pot: number;
    value: number;
    wage: number;
    expires: string | null;
    listed: { asking: number; date: string } | null;
    openBids: number;
  }[];
  offers: OfferView[];
  loansOut: LoanRow[];
  loansIn: LoanRow[];
  released: { pid: number; name: string; wage: number; until: string }[];
  fired: boolean;
}

/** A loan the user's club is part of: the other club, the end date and who pays the wage. */
export interface LoanRow {
  pid: number;
  name: string;
  position: Position;
  age: number;
  ovr: number;
  /** The loan club (loans out) or the parent club (loans in). */
  club: TeamRef;
  until: string;
  /** The loan club's share of the wage (0, 0.5 or 1). */
  wageShare: number;
}

/** The Youth Academy page (M6): the user's academy players and what deciding means. */
export interface AcademyView {
  date: string;
  /** The coming 1 July: players 18 or older then must be decided by it (SPEC §7.2). */
  decideBy: string;
  seniors: number;
  maxSeniors: number;
  /** The Youth academy dial (0–100): intake size and quality. */
  youthDial: number;
  players: {
    pid: number;
    name: string;
    position: Position;
    secondary: Position[];
    age: number;
    nationality: string;
    ovr: number;
    pot: number;
    /** OVR change at the last development update. */
    change: number | null;
    /** 18 or older on `decideBy`: promote him by then, or the AI rule decides. */
    mustDecide: boolean;
    /** His wage a year on a first pro contract now. */
    wage: number;
  }[];
}

/** The user's club finances and facilities (M6, SPEC §11). */
export interface ClubFinancesView {
  season: number;
  date: string;
  team: TeamRef;
  cash: number;
  /** This season so far, by kind. */
  revenue: { kind: string; label: string; amount: number }[];
  expenses: { kind: string; label: string; amount: number }[];
  profit: number;
  /** Fee amortisation booked this season (an FFP cost, not cash). */
  amortisation: number;
  /** Cash at the end of each past season, and now. */
  cashHistory: { season: number; cash: number; current: boolean }[];
  ffp: {
    /** Squad cost (wages and amortisation) over revenue, projected for this season. */
    ratio: number;
    limit: number;
    lastSeason: number | null;
    status: "ok" | "warned" | "banned";
    bannedUntil: string | null;
  };
  budget: { transfer: number; wageRoom: number; wageShare: number; base: number };
  /**
   * Under a soft cap (SPEC §17.7), in place of FFP and the transfer budget: the cap now,
   * and last season's luxury tax paid and share received. Null in a world without one.
   */
  cap: (CapView & { lastSeason: { season: number; paid: number; received: number } | null }) | null;
  dials: {
    key: "coaching" | "youth" | "medical" | "facilities";
    label: string;
    what: string;
    level: number;
    /** Euros a season at this level. */
    cost: number;
    /** What the dial does now, relative to other clubs (50 = average). */
    effect: number;
  }[];
  /** A dial's cost a season at level 0 and at 100 (straight line between). */
  dialCostRange: { at0: number; at100: number };
  facilitiesLevel: number;
  ticket: {
    price: number;
    /** The AI's price for the club (what "Auto" charges). */
    fair: number;
    auto: boolean;
    /** True once the season's first home match is played. */
    locked: boolean;
    capacity: number;
    /** A league home match at a few prices: the expected crowd and gate. */
    curve: { price: number; attendance: number; gate: number }[];
  };
}

/** The "You're fired" screen (M6, SPEC §6.5): the club that sacked the user and his offers. */
export interface FiredView {
  date: string;
  /** The club that sacked him. */
  club: TeamRef;
  leagueName: string;
  record: { position: number | null; played: number; won: number; drawn: number; lost: number };
  confidence: number;
  offers: {
    team: TeamRef;
    leagueName: string;
    reputation: number;
    /** Mean OVR of its 11 best fit seniors. */
    strength: number;
    position: number | null;
    /** What its board will expect. */
    expectation: string | null;
  }[];
}

/** Injuries: every injured player in the world now. */
export interface InjuriesView {
  date: string;
  rows: {
    pid: number;
    name: string;
    club: TeamRef;
    leagueId: string;
    position: string;
    ovr: number;
    type: string;
    until: string;
    daysLeft: number;
  }[];
}

/** League History (SPEC §10.5): each finished season's honours, newest first. */
export interface HistoryView {
  seasons: {
    season: number;
    leagues: {
      id: string;
      name: string;
      champion: TeamRef | null;
      /** Where a play-off decides the title: the club that topped the table (not a title). */
      tableWinner: TeamRef | null;
      promoted: TeamRef[];
      playoffWinner: TeamRef | null;
      relegated: TeamRef[];
      playerOfTheYear: { pid: number | null; name: string; club: TeamRef | null } | null;
      goldenBoot: {
        pid: number | null;
        name: string;
        club: TeamRef | null;
        goals: number | null;
      } | null;
      /** Most league assists; null for seasons that ended before the award existed. */
      topAssists: {
        pid: number | null;
        name: string;
        club: TeamRef | null;
        assists: number | null;
      } | null;
    }[];
    cups: { id: string; name: string; winner: TeamRef | null }[];
  }[];
}

/** A club's history: every season's league finish and honours. */
export interface TeamHistoryView {
  team: TeamRef;
  seasons: {
    season: number;
    leagueId: string;
    leagueName: string;
    finish: number | null;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    honours: string[];
    topScorer: { pid: number; name: string; goals: number } | null;
    current: boolean;
  }[];
  /** Trophies and promotions, counted. */
  honours: { label: string; seasons: number[] }[];
}

/** Transactions: a season's log (transfers, loans, signings, renewals, releases, promotions, retirements). */
export interface TransactionsView {
  season: number;
  rows: { xid: number; date: string; type: string; text: string; fee: number; cids: number[] }[];
}

/** Power Rankings: clubs by current strength and form. */
export interface PowerRankingsView {
  rows: {
    team: TeamRef;
    leagueId: string;
    /** Best fit XI now (injuries count) and at full strength. */
    strength: number;
    fullStrength: number;
    form: FormResult[];
    /** League goal difference per game this season. */
    goalDifferencePerGame: number;
    position: number | null;
    /** strength + 3 × goal difference per game (capped at ±2). */
    score: number;
  }[];
}

/** Finances overview of every club (SPEC §11): the current season, or a finished one. */
export interface FinancesView {
  season: number;
  current: boolean;
  rows: {
    team: TeamRef;
    leagueId: string;
    revenue: number;
    expenses: number;
    profit: number;
    /** Now (current season) or at the season's end. */
    cash: number;
    /** A year (current season only). */
    wages: number | null;
    /** Squad cost over revenue: projected now, or the season's FFP ratio. */
    squadCostRatio: number | null;
    /** Under a soft cap, the current season: the payroll and the club's cap. */
    payroll: number | null;
    cap: number | null;
    /** Under a soft cap, a finished season: the luxury tax paid and the share received. */
    taxPaid: number | null;
    taxReceived: number | null;
    ffp: "ok" | "warned" | "banned" | null;
    reputation: number;
  }[];
}

/** Win, draw or loss, for form guides. */
export type FormResult = "W" | "D" | "L";

/** What the player profile counts as honours, in display order. */
export type HonourType =
  | "champions"
  | "cupWinner"
  | "promoted"
  | "playerOfTheYear"
  | "goldenBoot"
  | "topAssists"
  | "teamOfTheSeason";

/** Before a match (SPEC §11, T 2026-10-25): recent results, the last meeting, a derby. */
export interface MatchPreviewView {
  fid: number;
  /** Each club's last five results this season before this match, oldest first: home, then away. */
  form: [ClubMatchView[], ClubMatchView[]];
  /** The clubs' latest meeting before this match; null if they haven't met in this save. */
  lastMeeting: MatchView | null;
  /** The city both clubs come from ("Manchester"), or null. */
  derby: string | null;
}

/** An inbox message; a bid message carries its offer while the offer is kept (its season). */
export type InboxMessageView = InboxMessage & {
  bid?: { oid: number; status: OfferView["status"] };
};

/** The Dashboard (M5, SPEC §11): the user's club at a glance, with the whole inbox. */
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
  /** Every message, newest first. */
  inbox: InboxMessageView[];
  unread: number;
  cash: number;
}

/** What the app shell needs for an open league (M5): names, clubs, leagues, the game state. */
export interface LeagueShell {
  lid: number;
  name: string;
  /** The save's world (SPEC §17.1): pages show by its switches; `cups`: it has cups. */
  world: { id: WorldId; name: string; switches: WorldSwitches; cups: boolean };
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
  /** "Watch next match": the fixture now live (null if play stopped before it, e.g. sacked). */
  live?: number | null;
}

// ---------------------------------------------------------------------------
// Shared pieces of the game's pages

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
  /** Result from the home club’s perspective; null until played. Includes shoot-outs. */
  homeResult: FormResult | null;
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
  /**
   * Why he can't sign now, in plain words, where the world's rules say so (a re-signing
   * period, free agency closed); null otherwise (the window rule above applies).
   */
  closedReason: string | null;
  userPlayer: boolean;
  /** Transfer: the fee his club accepted (null until a bid is accepted). */
  feeAgreed: number | null;
  /**
   * The user's seniors and the cap (SPEC §7.1): a full squad can't sign anyone. `enforced`
   * false: the limit doesn't count yet (the Super League's off-season, SPEC §17.4).
   */
  squad: { seniors: number; max: number; enforced: boolean };
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
    /** Cash below zero: transfer fees are frozen until it's back above zero (SPEC §6.4). */
    cashFrozen: boolean;
  };
  /** The soft cap in its place (SPEC §17.7; null in a world without one). */
  cap: CapView | null;
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

/** A market search (Transfer Market, Free Agents). */
export interface PlayerSearch {
  name?: string;
  nationality?: string;
  minAge?: number;
  minPot?: number;
  maxValue?: number;
  maxWage?: number;
  expiring?: boolean;
  position?: string;
  /** Only players at clubs in this league. */
  leagueId?: string;
  minOvr?: number;
  maxOvr?: number;
  maxAge?: number;
  freeAgents?: boolean;
  limit?: number;
}

export interface PlayerSearchRow {
  nationality: string;
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

/** A draft prospect, as the draft shows him. */
export interface DraftProspectView {
  pid: number;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  nationality: string;
}

/** A trade the user puts to another club (`cid`): what he gives and what he gets. */
export interface TradeProposal {
  cid: number;
  give: TradeAssets;
  get: TradeAssets;
}

/** The other club's answer: yes (the trade is made) or no, and why. */
export interface TradeAnswer {
  accepted: boolean;
  message: string;
}

/** "What would make this work?": the trade it would take (null: none), and its reply. */
export interface TradeWork {
  proposal: TradeProposal | null;
  message: string;
}

/** One slot of the draft: its owner (and the club whose slot it was, if traded). */
export interface DraftSlotView {
  pick: number;
  round: number;
  club: TeamRef;
  from: TeamRef | null;
  /** Who was picked; null while the pick is to come. */
  player: DraftProspectView | null;
}

/** A club in the draft lottery's pool (SPEC §17.5): where it finished, its odds, its draw. */
export interface DraftLotteryRow {
  club: TeamRef;
  /** Its league's name and its place in the table. */
  league: string;
  position: number;
  /** Its chance at the first pick (%). */
  odds: number;
  /** The first-round pick its slot drew; null until the lottery is drawn. */
  pick: number | null;
  /** Who holds that pick, when another club does. */
  owner: TeamRef | null;
}

/**
 * A draft (SPEC §17.5). This season's: before the lottery its class (and the lottery pool
 * if the season ended today); then its order, the picks made and to come, and who is on
 * the clock. A draft held: the picks made. A class to come: its prospects.
 */
export interface DraftView {
  /** The season whose draft it is (held the next June). */
  season: number;
  status: "class" | "notOrdered" | "on" | "over";
  /** The drafts the page can show, the oldest first: those held, this one, the classes after. */
  seasons: number[];
  /** The lottery's and the draft's days. */
  lotteryDate: string;
  draftDate: string;
  /** This season's lottery pool (as it stands or as drawn); null for other drafts. */
  lottery: DraftLotteryRow[] | null;
  userCid: number;
  /** The pick being made, and whether it's the user's club's. */
  onTheClock: number | null;
  yourTurn: boolean;
  slots: DraftSlotView[];
  /** The prospects still there, the best (OVR) first. */
  prospects: DraftProspectView[];
}

/** One draft pick a club holds (SPEC §17.5). */
export interface DraftPickRow {
  /** The season whose draft it is in (held the next June). */
  season: number;
  round: number;
  /** The club whose slot it is, when it isn't the holder's own. */
  from: TeamRef | null;
  /** Its number once the lottery has set it. */
  pick: number | null;
  /**
   * Before the lottery, for this season's draft: where it would fall if the season ended
   * today (by squad strength before a league match), and whether that's in the lottery pool,
   * whose draw can move it. Null for later drafts.
   */
  projected: { pick: number; lottery: boolean } | null;
}

/** A squad player as the Trade page shows him. */
export interface TradePlayerView {
  pid: number;
  name: string;
  nationality: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  wage: number;
  /** His contract's last day. */
  expires: string;
  injured: boolean;
  /** Why his club can't trade him now (null: it can). */
  untradable: string | null;
}

/** One club's side of a trade: its squad and picks, and its payroll and squad before and after. */
export interface TradeSideView {
  club: TeamRef;
  players: TradePlayerView[];
  picks: DraftPickRow[];
  /** Payroll (wages under contract plus those owed to released players) now and after. */
  payroll: number;
  payrollAfter: number;
  /** Its cap this season (its old tier's in a grace season); null without a cap. */
  cap: number | null;
  squad: number;
  squadAfter: number;
}

/**
 * The Trade page (SPEC §17.6, §17.8): the user's side and the other club's, for the trade
 * as proposed. `proposal` is the one sent, less what no longer belongs to either club.
 */
export interface TradeView {
  proposal: TradeProposal;
  user: TradeSideView;
  other: TradeSideView;
  /** Why trades are closed today; null while they're open. */
  closed: string | null;
  /** The rules the trade breaks (none while nothing is proposed). */
  problems: string[];
}

/** An offer on the trading block: what the club gives for what the user put up. */
export interface TradingBlockOffer {
  proposal: TradeProposal;
  club: TeamRef;
  players: TradePlayerView[];
  picks: DraftPickRow[];
}

/** The Trading Block (SPEC §17.6): his squad and picks, and the best offers for those put up. */
export interface TradingBlockView {
  user: TradeSideView;
  closed: string | null;
  /** Best for him first; empty while nothing is put up. */
  offers: TradingBlockOffer[];
}

/** A club's draft picks: those it holds, and its own that other clubs hold. */
export interface DraftPicksView {
  club: TeamRef;
  picks: DraftPickRow[];
  tradedAway: { season: number; round: number; holder: TeamRef }[];
}

/** A final-year player on the Re-sign Players page. */
export interface ResigningRow {
  pid: number;
  name: string;
  nationality: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  /** His wage now, a year. */
  wage: number;
  mood: number;
  willing: boolean;
  /** His lowest ask a year (over 1–5 years) for a new contract. */
  ask: number;
}

/**
 * Re-sign Players (SPEC §17.6): the user's players whose contracts end this 30 June. They
 * can be re-signed only in the re-signing period (from the draft to 30 June), over the cap
 * too; anyone not re-signed leaves on 1 July.
 */
export interface ResigningView {
  open: boolean;
  /** The period's first and last days this season. */
  opens: string;
  closes: string;
  players: ResigningRow[];
  /** This season's cap (null without one). */
  cap: CapView | null;
  /**
   * Next season: the wages already committed (contracts running past 30 June, released
   * players still owed) and the cap then, in the club's league as it stands.
   */
  next: { committed: number; cap: number | null; league: string };
}

export interface WorkerApi {
  getStatus(): WorkerStatus;
  listLeagues(): LeagueSummary[];
  getClubChoices(world: WorldId): ClubChoice[];
  createLeague(input: NewLeagueInput): LeagueSummary;
  deleteLeague(lid: number): void;
  /**
   * A tab opens a league (its pages call nothing else first). The worker keeps one league
   * open: tabs showing another stop, and their calls are refused rather than switching back.
   */
  openLeague(lid: number): void;
  getGameState(lid: number): GameState;
  getLeagueShell(lid: number): LeagueShell;
  getDashboard(lid: number): DashboardView;
  getTeamSquad(lid: number, cid: number): TeamSquadView;
  getPlayer(lid: number, pid: number): PlayerView;
  getBoxScore(lid: number, fid: number): BoxScoreView;
  getGameLog(lid: number, cid: number, season: number | null): GameLogView;
  getMatchPreview(lid: number, fid: number): MatchPreviewView;
  getLeagueLeaders(lid: number, leagueId: string | null, season: number | null): LeagueLeadersView;
  getPlayerRatings(lid: number): PlayerRatingsView;
  getPlayerStats(lid: number, season: number | null, competition: string | null): PlayerStatsView;
  getTeamStats(lid: number, leagueId: string | null, season: number | null): TeamStatsView;
  getInjuries(lid: number): InjuriesView;
  getFreeAgents(lid: number): FreeAgentsView;
  getResigning(lid: number): ResigningView;
  getTransferMarket(lid: number): TransferMarketView;
  getAcademy(lid: number): AcademyView;
  /** When the user has been sacked: the club, his record and his job offers (else null). */
  getJobOffers(lid: number): FiredView | null;
  /** Renames the save (Settings). */
  renameLeague(lid: number, name: string): void;
  /** Promotes (first pro contract) or releases one of the user's academy players. */
  decideAcademyPlayer(lid: number, pid: number, decision: "promote" | "release"): string;
  getClubFinances(lid: number): ClubFinancesView;
  setBudgetDials(
    lid: number,
    dials: { coaching: number; youth: number; medical: number; facilities: number },
  ): ClubFinancesView;
  /** The season's ticket price (null = Auto, the AI's fair price); locked after a home match. */
  setTicketPrice(lid: number, price: number | null): ClubFinancesView;
  /** The fees/wages control (SPEC §6.3): the share of FFP headroom kept for wages. */
  setClubWageShare(lid: number, share: number): ClubFinancesView;
  /** Lists one of the user's players at an asking price, or takes him off the list (null). */
  listPlayer(lid: number, pid: number, asking: number | null): TransferMarketView;
  /** Releases one of the user's players; returns what it costs, in words. */
  releasePlayer(lid: number, pid: number): string;
  /** A club's line-up (null = the user's). */
  getTactics(lid: number, cid: number | null): TacticsView;
  /** The user's unsaved line-up as the page would show it (re-slotted or the AI's pick). */
  previewTactics(lid: number, setup: TacticsSetup, mode: TacticsMode): TacticsView;
  /** Saves the user's line-up; it applies to the matches he watches. */
  saveTactics(lid: number, setup: TacticsSetup): TacticsView;
  /** The live match, with feed events from index `from` (null when none is under way). */
  getLiveMatch(lid: number, from: number): LiveMatchView | null;
  /**
   * Plays up to `possessions` possessions, stopping early at a break or when one of the
   * user's players is injured or sent off (`autoPause`, off for "To full time"). At full
   * time the day is finished and saved.
   */
  stepLiveMatch(lid: number, possessions: number, from: number, autoPause: boolean): LiveMatchView;
  /** The user's changes at a pause (subs, formation, positions, sliders): all or nothing. */
  changeLiveMatch(lid: number, changes: LiveChanges, from: number): LiveMatchView;
  /** At a pause: the user's side as a tactics board, with each player's match so far. */
  getLiveBoard(lid: number): LiveBoardView;
  /** The board as it would be after these changes; nothing is changed or saved. */
  previewLiveChanges(lid: number, changes: LiveChanges): LiveBoardView;
  /** Before kick-off: the user's line-up for this match, as the Tactics editor shows it. */
  getLiveLineup(lid: number): TacticsView;
  /**
   * Before kick-off: changes the line-up for this match only ("auto" = the AI's pick for
   * this fixture, as in a simulated match; "saved" = the saved Tactics as they are). One
   * that can start the match restarts it from kick-off; one that can't is kept, with why
   * (`cantStart`), and kick-off waits.
   */
  setLiveLineup(lid: number, setup: TacticsSetup, mode: TacticsMode): TacticsView;
  getHistory(lid: number): HistoryView;
  getTeamHistory(lid: number, cid: number): TeamHistoryView;
  getTransactions(lid: number, season: number | null): TransactionsView;
  getPowerRankings(lid: number): PowerRankingsView;
  getFinances(lid: number, season: number | null): FinancesView;
  getStandings(lid: number, leagueId: string | null, season: number | null): StandingsView;
  getCups(lid: number, competition: string | null, season: number | null): CupView;
  /** `week`: the Monday of the week to show (null: the current week). */
  getSchedule(lid: number, week: string | null): ScheduleView;
  markAllInboxRead(lid: number): void;
  playGame(lid: number, option: PlayOption): PlayReport;
  /** A draft: `season`'s (null: this season's); see `DraftView.seasons`. */
  getDraft(lid: number, season: number | null): DraftView;
  /** The user's club picks `pid` when it's on the clock in the draft. */
  draftProspect(lid: number, pid: number): DraftView;
  getDraftPicks(lid: number, cid: number): DraftPicksView;
  /** Puts a trade to another club (SPEC §17.6): made at once if it says yes. */
  proposeTrade(lid: number, proposal: TradeProposal): TradeAnswer;
  /** "What would make this work?": what the other club would want added. */
  makeTradeWork(lid: number, proposal: TradeProposal): TradeWork;
  /** Answers an AI club's trade offer in the inbox (message `mid`). */
  respondToTradeOffer(lid: number, mid: number, accept: boolean): TradeAnswer;
  /** The Trade page for a trade as it stands (nothing is proposed to the other club). */
  getTrade(lid: number, proposal: TradeProposal): TradeView;
  /** The trading block: AI clubs' best offers for the players and picks he puts up. */
  getTradingBlock(lid: number, give: TradeAssets): TradingBlockView;
  acceptJobOffer(lid: number, cid: number): GameState;
  markInboxRead(lid: number, mid: number): void;
  getContractTalks(lid: number, pid: number): ContractTalks;
  renewContract(lid: number, pid: number, years: number): ContractTalks;
  bidForPlayer(lid: number, pid: number, fee: number): BidReply;
  signPlayer(lid: number, pid: number, years: number): ContractTalks;
  respondToOffer(lid: number, oid: number, accept: boolean): OfferView[];
  /** Loan a player out (to `cid`) or in (`cid` = your club); `wageShare`: the loan club's. */
  proposeLoan(
    lid: number,
    pid: number,
    cid: number,
    length: "half" | "season",
    wageShare: number,
  ): LoanReply;
  searchPlayers(lid: number, query: PlayerSearch): PlayerSearchRow[];
  /** The budget control (SPEC §6.3): 0 = all headroom for fees, 1 = all for wages. */
}

export interface UiEvents {
  /** The save list changed (a league was created or deleted, in any tab). */
  leaguesChanged: { leagues: LeagueSummary[] };
  tabsChanged: { connectedTabs: number };
  /** A league's game moved on or its data changed (a Play action or any other change, in any tab). */
  gameChanged: { lid: number; state: GameState };
  /**
   * The worker opened this league (it keeps one open at a time): tabs showing another
   * league stop and say so.
   */
  leagueOpened: { lid: number };
}
