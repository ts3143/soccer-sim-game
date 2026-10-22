/**
 * Match ratings, 0–10 (SPEC §8.7): built from each player's contributions relative to
 * what's normal for his position. Average ~6.9 (keepers ~6.8); a soft top keeps 9+ rare
 * and 10 rarer.
 * Keepers are judged mostly on goals prevented (post-shot xG faced minus goals conceded),
 * and a soft bottom keeps even a howler around 4.5. Ratings feed form, development
 * (performanceAdj) and awards.
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
    score += w.goalPrevented * (p.psxgFaced - p.goalsConceded) + w.keeperConceded * p.goalsConceded;
  } else if (defender) {
    score += w.defenderConceded * p.goalsConceded + w.defenderCleanSheet * p.cleanSheet;
  }
  const share = Math.min(1, p.minutes / 90);
  if (result === "win") score += w.win * share;
  if (result === "loss") score += w.loss * share;
  return score;
}

/** Above `softTop.from` a rating climbs at `softTop.slope`. */
function softTop(rating: number, c: Coefficients): number {
  const top = c.ratings.softTop;
  return rating > top.from ? top.from + (rating - top.from) * top.slope : rating;
}

/** What a position's ratings average: the centre, a little lower for keepers. */
export function ratingCentre(position: Position, c: Coefficients): number {
  return c.ratings.centre + (position === "GK" ? c.ratings.keeperCentreOffset : 0);
}

/** Limits to 3–10, one decimal. */
const finish = (rating: number) => Math.round(Math.min(10, Math.max(3, rating)) * 10) / 10;

/**
 * `rest`: the share of a full match he has still to play, assumed average for his position
 * (the live board's rating so far; 0 once his match is over).
 */
export function matchRating(
  p: PlayerMatchStats,
  result: "win" | "draw" | "loss",
  c: Coefficients,
  rest = 0,
): number {
  const r = c.ratings;
  const weight = Math.min(1, p.minutes / r.fullWeightMinutes);
  const centre = ratingCentre(p.position, c);
  const raw = rawMatchScore(p, result, c) + (r.expected[p.position] - 6) * rest;
  let rating = softTop(centre + (raw - r.expected[p.position]) * weight, c);
  const floor = r.keeperSoftBottom;
  if (p.position === "GK" && rating < floor.from) {
    rating = floor.from - (floor.from - rating) * floor.slope;
  }
  return finish(rating);
}

/**
 * Saves made before the 6.9 scale (league DB v2) hold ratings centred on 6.6. Over the
 * same matches, the best straight line from old to new is new = 6.9 + 1.12 × (old − 6.6)
 * (keepers: 6.8 + …).
 */
export const OLD_RATING_SCALE = { centre: 6.6, slope: 1.12 };

/** One old-scale match rating on the current scale. */
export function ratingFromOldScale(old: number, position: Position, c: Coefficients): number {
  const { centre, slope } = OLD_RATING_SCALE;
  return finish(softTop(ratingCentre(position, c) + slope * (old - centre), c));
}

/** A sum of `appearances` old-scale ratings on the current scale. */
export function ratingTotalFromOldScale(
  total: number,
  appearances: number,
  position: Position,
  c: Coefficients,
): number {
  const { centre, slope } = OLD_RATING_SCALE;
  const converted =
    ratingCentre(position, c) * appearances + slope * (total - centre * appearances);
  return Math.round(converted * 10) / 10;
}
