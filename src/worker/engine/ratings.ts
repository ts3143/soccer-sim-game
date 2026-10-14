/**
 * Match ratings, 0–10 (SPEC §8.7): built from each player's contributions relative to
 * what's normal for his position. Target average ~6.6, typical range 5.0–8.5, 9+ rare.
 * They feed form, development (performanceAdj) and awards.
 */
import type { Position } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import type { Coefficients } from "./coefficients";

const DEFENDERS: readonly Position[] = ["CB", "FB", "WB"];

/** Raw score before centring on the position's average. */
export function rawMatchScore(
  p: PlayerMatchStats,
  result: "win" | "draw" | "loss",
  c: Coefficients,
): number {
  const w = c.ratings;
  const keeper = p.position === "GK";
  const defender = DEFENDERS.includes(p.position);
  let score =
    6 +
    w.goal * p.goals +
    w.assist * p.assists +
    w.keyPass * p.keyPasses +
    w.shotOnTarget * p.shotsOnTarget +
    w.shotOff * (p.shots - p.shotsOnTarget) +
    w.dribbleWon * p.dribblesCompleted +
    w.dribbleLost * (p.dribbles - p.dribblesCompleted) +
    w.tackle * p.tackles +
    w.interception * p.interceptions +
    w.clearance * p.clearances +
    w.block * p.blocks +
    w.aerialWon * p.aerialsWon +
    w.progressivePass * p.progressivePasses +
    w.passCompleted * p.passesCompleted +
    w.passFailed * (p.passes - p.passesCompleted) +
    w.yellow * p.yellowCards +
    w.red * p.redCards +
    w.foul * p.fouls +
    w.foulWon * p.foulsWon;
  if (keeper) {
    score +=
      w.save * p.saves + w.keeperConceded * p.goalsConceded + w.keeperCleanSheet * p.cleanSheet;
  } else if (defender) {
    score += w.defenderConceded * p.goalsConceded + w.defenderCleanSheet * p.cleanSheet;
  }
  const share = Math.min(1, p.minutes / 90);
  if (result === "win") score += w.win * share;
  if (result === "loss") score += w.loss * share;
  return score;
}

export function matchRating(
  p: PlayerMatchStats,
  result: "win" | "draw" | "loss",
  c: Coefficients,
): number {
  const centred = 6.6 + rawMatchScore(p, result, c) - c.ratings.expected[p.position];
  const weight = Math.min(1, p.minutes / c.ratings.fullWeightMinutes);
  const rating = 6.6 + (centred - 6.6) * weight;
  return Math.round(Math.min(10, Math.max(3, rating)) * 10) / 10;
}
