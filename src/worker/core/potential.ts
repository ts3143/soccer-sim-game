/**
 * Displayed POT (SPEC §4.4): the 75th-percentile peak OVR over ~20 simulated career
 * arcs, using the player's expected minutes at his current club, so a prospect stuck
 * behind better players visibly loses POT. The hidden ceiling stays the true limit.
 */
import type { Position } from "../../common/config/ratings";
import type { CurveType } from "../../common/schema";
import {
  coachingFactor,
  developHalfSeason,
  medicalFactor,
  youthFactor,
  type DevelopmentInput,
} from "./development";
import { rawPositionOvr } from "./ovr";
import type { Random } from "./random";

export const POT_ARCS = 20;
/** Arcs run until this age (or two more seasons for older players). */
const ARC_END_AGE = 31;
/** Academy players start getting senior minutes from this age in the arcs. */
const ACADEMY_UNTIL_AGE = 18.5;

export interface PotentialClubContext {
  coachingDial: number;
  medicalDial: number;
  youthDial: number;
  /** Mean slot OVR of the club's best XI: decides how much he can expect to play. */
  xiStrength: number;
  /** Average team strength of the league he plays in. */
  levelStrength: number;
}

export interface PotentialInput {
  ratings: readonly number[];
  position: Position;
  age: number;
  curve: CurveType;
  ceiling: number;
  academy: boolean;
  club: PotentialClubContext;
}

/** Expected share of minutes for a player of `ovr` at a club whose XI averages `xi`. */
export function expectedMinutesShare(ovr: number, xi: number): number {
  const d = ovr - xi;
  return 0.08 + 0.77 / (1 + Math.exp(-(d + 5) / 2.5));
}

export function estimatePotential(input: PotentialInput, rng: Random, arcs = POT_ARCS): number {
  const current = rawPositionOvr(input.ratings, input.position);
  const endAge = Math.max(ARC_END_AGE, input.age + 2);
  const peaks: number[] = [];

  for (let arc = 0; arc < arcs; arc++) {
    let ratings = [...input.ratings];
    let age = input.age;
    let ovr = current;
    let peak = current;
    while (age < endAge) {
      const inAcademy = input.academy && age < ACADEMY_UNTIL_AGE;
      const dev: DevelopmentInput = {
        age,
        curve: input.curve,
        ceiling: input.ceiling,
        ovr,
        coaching: coachingFactor(input.club.coachingDial),
        medical: medicalFactor(input.club.medicalDial),
        minutesShare: inAcademy ? 0 : expectedMinutesShare(ovr, input.club.xiStrength),
        levelStrength: input.club.levelStrength,
        performanceAdj: 0,
        academyYouth: inAcademy ? youthFactor(input.club.youthDial) : null,
      };
      ratings = developHalfSeason(ratings, dev, rng);
      age += 0.5;
      ovr = rawPositionOvr(ratings, input.position);
      if (ovr > peak) peak = ovr;
    }
    peaks.push(peak);
  }

  peaks.sort((a, b) => a - b);
  const p75 = peaks[Math.ceil(0.75 * peaks.length) - 1] ?? current;
  return Math.min(100, Math.max(0, Math.round(Math.max(p75, current))));
}
