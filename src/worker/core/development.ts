/**
 * Player development core (SPEC §5): pure functions for one half-season update of a
 * player's ratings. Built in M1 because POT is computed from simulated career arcs;
 * M3 runs it at the summer and winter updates and calibrates the coefficients
 * against data/config/calibration_targets.json.
 *
 *   dev    = coaching × (base + (1 − base) × minutesFactor × challengeFactor) + performanceAdj
 *            (base = 0.2, the training base)
 *   devEff = dev blended linearly to neutral (1.0) between ages 23 and 27
 *   growth  (ageCurve > 0): Δ = a × devEff × noise × gap / (gap + 8)
 *   decline (ageCurve ≤ 0): Δ = a × medicalFactor × noise         (dev never applies)
 *   mental group, any age:  Δ += mentalMinutesBonus × minutesFactor
 */
import { RATING_CODES, ratingsConfig, type AgeCurveGroup } from "../../common/config/ratings";
import type { CurveType } from "../../common/schema";
import type { Random } from "./random";

/**
 * Annual rating change at neutral development, by age, per group. Linear between
 * points, flat beyond the ends. Physical peaks earliest and falls first; technical
 * peaks mid-career; mental grows into the early 30s; goalkeeping peaks ~29–33.
 * Provisional values: calibrated in M3.
 */
const AGE_CURVES: Record<Exclude<AgeCurveGroup, "fixed">, readonly [number, number][]> = {
  physical: [[16, 7], [18, 6], [20, 4.5], [22, 3], [24, 1.5], [25, 0], [27, -0.8], [29, -2], [31, -3.5], [33, -5.5], [35, -7.5], [38, -10]],
  technical: [[16, 7], [18, 6.5], [20, 5.5], [22, 4], [24, 2.5], [26, 1], [27, 0], [29, -0.8], [31, -2], [33, -4], [35, -6], [38, -9]],
  mental: [[16, 6], [20, 5], [24, 3.5], [27, 2], [30, 1], [32, 0], [34, -1.5], [36, -3], [38, -5]],
  goalkeeping: [[16, 6], [20, 5], [24, 3.5], [27, 2], [29, 0.8], [31, 0], [33, -1.5], [35, -3.5], [38, -6]],
}; // prettier-ignore

/** Coefficients (tuned in M3 with `pnpm calibrate --world`; see PROGRESS.md M3 notes). */
export const DEV = {
  /** Years the curve is shifted: early bloomers behave older, late bloomers younger. */
  curveShift: { normal: 0, early: 2, late: -2, ageless: 0 } as Record<CurveType, number>,
  /** Ageless players decline later and slower. */
  agelessDeclineDelay: 2,
  agelessDeclineScale: 0.6,
  /** The dev multiplier is full strength up to this age and neutral from blendEnd. */
  blendStart: 23,
  blendEnd: 27,
  /** Growth softening near the ceiling: × gap / (gap + ceilingSoftness). */
  ceilingSoftness: 8,
  mentalMinutesBonus: 0.35,
  /**
   * The dev multiplier's training base: what a player with no minutes still gets (SPEC §5.3;
   * T 2026-10-15, was 0.4).
   */
  trainingBase: 0.2,
  /**
   * Extra growth for young players (M3 calibration): growth × `scale` up to `fullBelow`,
   * fading linearly to × 1 at `noneFrom`. Front-loads growth without lifting older players.
   */
  youngGrowth: { scale: 3, fullBelow: 22, noneFrom: 26 },
  /** Growth multiplier for academy players (coaching + Youth dial only, SPEC §5.3). */
  academyGrowth: 0.5,
  /**
   * Scales decline (age-curve value ≤ 0) by `scale` from age `fullFrom`, phasing in
   * linearly from 1 at `from`: steeper decline in the mid-30s without ageing the early 30s.
   */
  decline: { scale: 1.5, from: 31, fullFrom: 33 },
  /** Per-update player-wide noise (breakouts and stalls) and per-rating noise. */
  growthNoiseSd: 0.45,
  declineNoiseSd: 0.25,
  ratingNoiseSd: 0.5,
  performanceAdjCap: 0.15,
};

/** Age-curve value (annual Δ at neutral development) for a group, age and curve type. */
export function ageCurve(group: AgeCurveGroup, age: number, curve: CurveType): number {
  if (group === "fixed") return 0;
  const rate = interpolate(AGE_CURVES[group], age + DEV.curveShift[curve]);
  if (curve === "ageless" && rate < 0) {
    return (
      Math.min(0, interpolate(AGE_CURVES[group], age - DEV.agelessDeclineDelay)) *
      DEV.agelessDeclineScale
    );
  }
  return rate;
}

function interpolate(points: readonly [number, number][], x: number): number {
  const first = points[0] as [number, number];
  const last = points[points.length - 1] as [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    const [x0, y0] = points[i - 1] as [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Share of available minutes → development factor, with diminishing returns. */
export function minutesFactor(share: number): number {
  const s = Math.min(1, Math.max(0, share));
  return 1 - (1 - s) ** 2;
}

/**
 * How well the level he played at suits him: peaks when the level (opponents' average
 * team OVR) is at or slightly above his OVR; small when he is far too good for it
 * (blocks the weak-loan exploit) or badly out of his depth.
 */
export function challengeFactor(levelStrength: number, ovr: number): number {
  const d = levelStrength - ovr - 2.5;
  const width = d < 0 ? 9 : 14;
  return 0.25 + 0.75 * Math.exp(-((d / width) ** 2));
}

/** Budget dial (0–100, 50 = typical) → coaching factor 0.9–1.1. */
export const coachingFactor = (dial: number): number => 0.9 + 0.2 * (dial / 100);
/** Budget dial → decline multiplier: a high Medical dial slightly slows decline. */
export const medicalFactor = (dial: number): number => 1.08 - 0.16 * (dial / 100);
/** Youth academy dial → academy training quality 0.3–0.7. */
export const youthFactor = (dial: number): number => 0.3 + 0.4 * (dial / 100);

export interface DevelopmentInput {
  age: number;
  curve: CurveType;
  ceiling: number;
  /** Current OVR at the listed position. */
  ovr: number;
  /** Coaching factor (0.9–1.1) of the club where he actually plays. */
  coaching: number;
  /** Decline multiplier from the Medical dial. */
  medical: number;
  /** Share of available minutes in the half-season (0–1). Ignored for academy players. */
  minutesShare: number;
  /** Minutes-weighted average team OVR of the level he played at. */
  levelStrength: number;
  /** Match ratings vs positional expectation; clamped to ±0.15. */
  performanceAdj: number;
  /** Academy players develop on Coaching + Youth only (youthFactor), without minutes. */
  academyYouth: number | null;
}

/** The dev multiplier before blending (SPEC §5.3). */
export function devMultiplier(input: DevelopmentInput): number {
  const base = DEV.trainingBase;
  if (input.academyYouth !== null) return input.coaching * (base + (1 - base) * input.academyYouth);
  const performance = Math.max(
    -DEV.performanceAdjCap,
    Math.min(DEV.performanceAdjCap, input.performanceAdj),
  );
  return (
    input.coaching *
      (base +
        (1 - base) *
          minutesFactor(input.minutesShare) *
          challengeFactor(input.levelStrength, input.ovr)) +
    performance
  );
}

/** devEff: full strength up to 23, blending linearly to neutral (1.0) by 27. */
export function effectiveDev(dev: number, age: number): number {
  const blend = Math.min(1, Math.max(0, (age - DEV.blendStart) / (DEV.blendEnd - DEV.blendStart)));
  return dev * (1 - blend) + blend;
}

const GROUP_OF = RATING_CODES.map((code) => ratingsConfig.ageCurveGroupOf[code]);

/**
 * One half-season update. Returns the new ratings (unrounded floats, clamped 0–100);
 * the caller rounds them when applying to a saved player.
 */
export function developHalfSeason(
  ratings: readonly number[],
  input: DevelopmentInput,
  rng: Random,
): number[] {
  const young = DEV.youngGrowth;
  const youngShare = Math.min(
    1,
    Math.max(0, (young.noneFrom - input.age) / (young.noneFrom - young.fullBelow)),
  );
  // Academy players develop on their own multiplier; the young-growth boost is for players
  // in senior football (or free agents), whose growth depends on minutes.
  const boost =
    input.academyYouth !== null ? DEV.academyGrowth : 1 + (young.scale - 1) * youngShare;
  const devEff = effectiveDev(devMultiplier(input), input.age) * boost;
  const d = DEV.decline;
  const declineShare = Math.min(1, Math.max(0, (input.age - d.from) / (d.fullFrom - d.from)));
  const declineScale = 1 + (d.scale - 1) * declineShare;
  const gap = Math.max(0, input.ceiling - input.ovr);
  const softening = gap / (gap + DEV.ceilingSoftness);
  const growthNoise = Math.max(-0.5, rng.normal(1, DEV.growthNoiseSd));
  const declineNoise = Math.max(0, rng.normal(1, DEV.declineNoiseSd));
  const mentalBonus =
    input.academyYouth === null ? DEV.mentalMinutesBonus * minutesFactor(input.minutesShare) : 0;
  // Half-season age-curve value, once per group rather than once per rating.
  const halfCurve = {
    physical: ageCurve("physical", input.age, input.curve) / 2,
    technical: ageCurve("technical", input.age, input.curve) / 2,
    mental: ageCurve("mental", input.age, input.curve) / 2,
    goalkeeping: ageCurve("goalkeeping", input.age, input.curve) / 2,
  };

  return ratings.map((value, i) => {
    const group = GROUP_OF[i] as AgeCurveGroup;
    if (group === "fixed") return value;
    const a = halfCurve[group];
    let delta =
      a > 0
        ? a * devEff * growthNoise * softening
        : a * declineScale * input.medical * declineNoise;
    if (group === "mental") delta += mentalBonus;
    delta += rng.normal(0, DEV.ratingNoiseSd);
    return Math.min(100, Math.max(0, value + delta));
  });
}
