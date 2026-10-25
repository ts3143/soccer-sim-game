/**
 * Match engine input and output types (SPEC §8, §10). The engine is pure: give it a
 * MatchInput (and optionally coefficients), get events and a MatchResult back. All
 * randomness comes from the input's seed.
 */
import type { StyleModifiers } from "../../common/config/competitions";
import type { Foot, SliderSettings } from "../../common/schema";

import type { TeamSide } from "../../common/match";

export type { TeamSide };

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

export type {
  MatchEvent,
  MatchResult,
  Period,
  PlayerMatchStats,
  ShotOutcome,
  ShotStory,
  ShotType,
  TeamMatchStats,
} from "../../common/match";
