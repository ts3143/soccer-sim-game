/**
 * OVR (SPEC §4.3): for each of the 10 position groups, the weighted mean of that
 * position's ratings (weights from ratings_positions.json), mapped through the fixed
 * per-position scaling constants. OVR is a pure function of ratings + config.
 */
import {
  POSITIONS,
  RATING_INDEX,
  ratingsConfig,
  type OvrScaling,
  type Position,
  type RatingCode,
  type Side,
} from "../../common/config/ratings";
import type { Foot } from "../../common/schema";

interface WeightVector {
  indexes: number[];
  weights: number[];
  total: number;
}

const WEIGHTS = Object.fromEntries(
  POSITIONS.map((position) => {
    const entries = Object.entries(ratingsConfig.positions[position].weights) as [
      RatingCode,
      number,
    ][];
    const indexes = entries.map(([code]) => RATING_INDEX[code]);
    const weights = entries.map(([, weight]) => weight);
    return [position, { indexes, weights, total: weights.reduce((s, w) => s + w, 0) }];
  }),
) as Record<Position, WeightVector>;

export const POSITION_INDEX = Object.fromEntries(POSITIONS.map((p, i) => [p, i])) as Record<
  Position,
  number
>;

/** Weighted mean of the ratings that matter at a position (before scaling). */
export function weightedMean(ratings: readonly number[], position: Position): number {
  const { indexes, weights, total } = WEIGHTS[position];
  let sum = 0;
  for (let i = 0; i < indexes.length; i++) {
    sum += (ratings[indexes[i] as number] as number) * (weights[i] as number);
  }
  return sum / total;
}

/** Unrounded OVR at a position. `scaling` defaults to the fitted config constants. */
export function rawPositionOvr(
  ratings: readonly number[],
  position: Position,
  scaling: OvrScaling = ratingsConfig.ovrScaling[position],
): number {
  return scaling.offset + scaling.scale * weightedMean(ratings, position);
}

/** OVR at a position: rounded and clamped to 0–100. */
export function positionOvr(ratings: readonly number[], position: Position): number {
  return Math.min(100, Math.max(0, Math.round(rawPositionOvr(ratings, position))));
}

/** OVRs at all 10 positions, in POSITIONS order. */
export function positionOvrs(ratings: readonly number[]): number[] {
  return POSITIONS.map((position) => positionOvr(ratings, position));
}

/** The listed position: the best OVR (ties go to the earlier position in POSITIONS). */
export function bestPosition(ovrs: readonly number[]): Position {
  let best = 0;
  for (let i = 1; i < POSITIONS.length; i++) {
    if ((ovrs[i] as number) > (ovrs[best] as number)) best = i;
  }
  return POSITIONS[best] as Position;
}

/** Positions within `margin` OVR of the listed one (best first), excluding it. */
export function secondaryPositions(
  ovrs: readonly number[],
  listed: Position,
  margin = 3,
): Position[] {
  const top = ovrs[POSITION_INDEX[listed]] as number;
  return POSITIONS.filter(
    (p) => p !== listed && (ovrs[POSITION_INDEX[p]] as number) >= top - margin,
  )
    .sort((a, b) => (ovrs[POSITION_INDEX[b]] as number) - (ovrs[POSITION_INDEX[a]] as number))
    .slice(0, 3);
}

/** Penalty for playing a sided slot on the side opposite the preferred foot. */
export function wrongFootPenalty(position: Position, side: Side, foot: Foot): number {
  if (side === "C") return 0;
  const wrongSide = (side === "L" && foot === "R") || (side === "R" && foot === "L");
  return wrongSide ? (ratingsConfig.wrongFootPenalty[position] ?? 0) : 0;
}

/** OVR in a formation slot: position OVR minus any wrong-foot penalty. */
export function slotOvr(
  player: { ovrs: readonly number[]; foot: Foot },
  slot: { position: Position; side: Side },
): number {
  return (
    (player.ovrs[POSITION_INDEX[slot.position]] as number) -
    wrongFootPenalty(slot.position, slot.side, player.foot)
  );
}

/** ZenGM-style band label for an OVR (internal use). */
export function ovrBand(ovr: number): string {
  return ratingsConfig.ovrBands.find((band) => ovr >= band.min)?.label ?? "Bad player";
}
