/**
 * Match output shared by the worker (engine, saved match records) and the UI (box
 * scores, live feed): events, per-player and per-team stats (SPEC §10.1–10.2), results.
 */
import type { Position } from "./config/ratings";

/** 0 = home, 1 = away. */
export type TeamSide = 0 | 1;

export type ShotType = "central" | "header" | "dribble" | "longShot" | "penalty" | "freeKick";
export type ShotOutcome = "goal" | "saved" | "blocked" | "off";
export type Period = "first" | "second" | "extraFirst" | "extraSecond" | "penalties";

/**
 * How a shot came about, for the live commentary's words only: nothing in the game reads
 * it back. Feeds saved before it existed lack it.
 */
export interface ShotStory {
  /** A header from a corner or a crossed free kick, and who delivered it. */
  setPiece?: { kind: "corner" | "freeKick"; takerPid: number | null };
  /** The wing the cross or the dribble came from (the creator's slot). */
  flank?: "L" | "R";
  /** How the move began: a long ball forward, or the ball won back in the final third. */
  origin?: "longBall" | "wonHigh";
  /** A rebound after a block, or the second ball after a cleared set piece. */
  followUp?: true;
  /** The keeper who saved it, or the defender who blocked it. */
  stoppedBy?: number;
}

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
      story?: ShotStory;
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
      reason: "injury" | "fatigue" | "tactical" | "redCardKeeper" | "manager";
    }
  | {
      type: "injury";
      clock: number;
      side: TeamSide;
      pid: number;
      days: number;
      replaced: boolean;
    }
  | { type: "shootoutKick"; side: TeamSide; pid: number; scored: boolean };

/** Per player per match (SPEC §10.1). */
export interface PlayerMatchStats {
  pid: number;
  side: TeamSide;
  /** Formation slot he started in; null if he came off the bench. */
  startedInSlot: number | null;
  /** Position of the first slot he played in (sets his rating expectation). */
  position: Position;
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
  progressivePasses: number;
  crosses: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  blocks: number;
  aerialsWon: number;
  dribbles: number;
  dribblesCompleted: number;
  fouls: number;
  foulsWon: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  /**
   * Keepers: post-shot xG of the on-target shots faced, i.e. what an average keeper would
   * concede from them. Goals prevented = psxgFaced − goalsConceded (SPEC §8.7).
   */
  psxgFaced: number;
  goalsConceded: number;
  cleanSheet: number;
  /** Days out if injured in this match, else 0. */
  injuryDays: number;
  /** In-match energy (0–1) when he left the pitch or at full time. */
  energyEnd: number;
  /** Match rating, 0–10 (SPEC §8.7). */
  rating: number;
}

/** Per team per match (SPEC §10.2). */
export interface TeamMatchStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passesCompleted: number;
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
  /** Knockout winner (after aggregate, extra time and penalties); null otherwise. */
  winner: TeamSide | null;
  teams: [TeamMatchStats, TeamMatchStats];
  players: PlayerMatchStats[];
  /** Man of the match: the pid with the highest rating (SPEC §8.7); null if nobody played. */
  motm: number | null;
  /** Goals, cards, substitutions and injuries (the match record's key events). */
  keyEvents: MatchEvent[];
  /** Match length in seconds, including added time. */
  duration: number;
}

/** Event types kept in a saved match record (SPEC §10.4: no play-by-play is saved). */
export const KEY_EVENT_TYPES = ["goal", "card", "sub", "injury"] as const;
