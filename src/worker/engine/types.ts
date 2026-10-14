/**
 * Match engine input and output types (SPEC §8, §10). The engine is pure: give it a
 * MatchInput (and optionally coefficients), get events and a MatchResult back. All
 * randomness comes from the input's seed.
 */
import type { StyleModifiers } from "../../common/config/competitions";
import type { Foot, SliderSettings } from "../../common/schema";

/** 0 = home, 1 = away. */
export type TeamSide = 0 | 1;

export interface EnginePlayer {
  pid: number;
  /** The 22 ratings in RATING_CODES order. */
  ratings: readonly number[];
  /** Condition at kick-off, 0–100: in-match energy starts here. */
  condition: number;
  foot: Foot;
  injuryProne: boolean;
  hothead: boolean;
}

export interface EngineTeamInput {
  cid: number;
  formation: string;
  /** Player ID per formation slot (11, slot order as in the formation config). */
  lineup: number[];
  /** Substitutes in preference order (up to the bench size). */
  bench: number[];
  /** Everyone in the lineup and on the bench. */
  players: EnginePlayer[];
  sliders: SliderSettings;
  /**
   * The AI makes this team's in-game changes: true for every club in a simulated match,
   * false for the user's club in a match he watches (he makes them, via applyChanges).
   */
  aiInGame: boolean;
  /** Medical budget dial (0–100): lowers injury risk. */
  medicalDial: number;
}

export interface KnockoutRules {
  /** Play extra time if level after 90 minutes (after the tie, for second legs). */
  extraTime: boolean;
  penalties: boolean;
  /** First-leg score from this match's home team's point of view; null for one-off ties. */
  firstLeg: { home: number; away: number } | null;
}

export interface MatchInput {
  /** Seed for this match's random stream, e.g. `${leagueSeed}/match:${fid}`. */
  seed: string;
  home: EngineTeamInput;
  away: EngineTeamInput;
  neutralVenue: boolean;
  style: StyleModifiers;
  knockout: KnockoutRules | null;
  /** Keep every event for a live feed (watching); headless sims keep key events only. */
  feed: boolean;
}

export type ShotType =
  "central" | "header" | "dribble" | "longShot" | "rebound" | "penalty" | "freeKick";
export type ShotOutcome = "goal" | "saved" | "blocked" | "off";
export type Period = "first" | "second" | "extraFirst" | "extraSecond" | "penalties";

/** Something that happened, for the live feed and (key types) the match record. */
export type MatchEvent =
  | { type: "kickoff"; period: Period; clock: number }
  | { type: "periodEnd"; period: Period; clock: number }
  | {
      type: "shot";
      clock: number;
      side: TeamSide;
      pid: number;
      assistPid: number | null;
      shotType: ShotType;
      xg: number;
      outcome: ShotOutcome;
    }
  | {
      type: "goal";
      clock: number;
      side: TeamSide;
      pid: number;
      assistPid: number | null;
      penalty: boolean;
    }
  | { type: "foul"; clock: number; side: TeamSide; pid: number; victimPid: number | null }
  | {
      type: "card";
      clock: number;
      side: TeamSide;
      pid: number;
      card: "yellow" | "secondYellow" | "red";
    }
  | { type: "corner"; clock: number; side: TeamSide }
  | { type: "penaltyAwarded"; clock: number; side: TeamSide; pid: number | null }
  | {
      type: "sub";
      clock: number;
      side: TeamSide;
      outPid: number;
      inPid: number;
      reason: "injury" | "fatigue" | "tactical" | "redCardKeeper";
    }
  | { type: "injury"; clock: number; side: TeamSide; pid: number; days: number; replaced: boolean }
  | { type: "shootoutKick"; side: TeamSide; pid: number; scored: boolean };

export interface PlayerMatchStats {
  pid: number;
  side: TeamSide;
  /** Formation slot he started in; null if he came off the bench. */
  startedInSlot: number | null;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  xa: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  fouls: number;
  foulsWon: number;
  yellowCards: number;
  redCards: number;
  /** Days out if injured in this match, else 0. */
  injuryDays: number;
  /** In-match energy (0–1) when he left the pitch or at full time. */
  energyEnd: number;
}

export interface TeamMatchStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  /** Share of in-play time with the ball, 0–1. */
  possession: number;
  possessions: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  penaltiesAwarded: number;
  penaltiesScored: number;
  subsUsed: number;
  windowsUsed: number;
  injuries: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  extraTime: boolean;
  /** Shoot-out score (home-away) if there was one. */
  penalties: string | null;
  /** Knockout winner (after aggregate, extra time and penalties); null if not a knockout or a draw. */
  winner: TeamSide | null;
  teams: [TeamMatchStats, TeamMatchStats];
  players: PlayerMatchStats[];
  /** Goals, cards, substitutions and injuries (the match record's key events). */
  keyEvents: MatchEvent[];
  /** Match length in seconds, including added time. */
  duration: number;
}
