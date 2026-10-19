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

/** Ceiling decay for 19–23-year-olds short of minutes (SPEC §5.3); the season loop uses it too. */
export const CEILING_DECAY = { fromAge: 19, toAge: 23, belowShare: 0.15, min: 1, max: 3 };
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

/**
 * Expected minutes: a logistic in his gap to the club's XI level, from `floor` (far below)
 * to `cap`. Refitted in M4 to the minutes seniors actually get over the following season
 * (rotation, injuries, loans and moves included): 10 below the XI ~25%, 6 below ~45%, at XI
 * level ~75%, the best ~83%. (M3's fit, without loans and transfers: 0.85 / (1 + e^−(d+4.4)/2.1).)
 */
export const MINUTES_FIT = { floor: 0.07, cap: 0.83, mid: -6.3, width: 3 };

/** Expected share of minutes for a player of `ovr` at a club whose XI averages `xi`. */
export function expectedMinutesShare(ovr: number, xi: number): number {
  const f = MINUTES_FIT;
  return f.floor + (f.cap - f.floor) / (1 + Math.exp(-(ovr - xi - f.mid) / f.width));
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
    let ceiling = input.ceiling;
    let seasonShare = 0;
    let halves = 0;
    while (age < endAge) {
      const inAcademy = input.academy && age < ACADEMY_UNTIL_AGE;
      const dev: DevelopmentInput = {
        age,
        curve: input.curve,
        ceiling,
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
      // Ceiling decay, as in the season loop: a 19–23-year-old with too few minutes over
      // a season loses 1–3 points of ceiling.
      seasonShare += dev.minutesShare / 2;
      if (++halves % 2 === 0) {
        const decay = CEILING_DECAY;
        if (
          !inAcademy &&
          age >= decay.fromAge &&
          age < decay.toAge + 1 &&
          seasonShare < decay.belowShare
        ) {
          ceiling = Math.max(ovr, ceiling - rng.int(decay.min, decay.max));
        }
        seasonShare = 0;
      }
    }
    peaks.push(peak);
  }

  peaks.sort((a, b) => a - b);
  const p75 = peaks[Math.ceil(0.75 * peaks.length) - 1] ?? current;
  return Math.min(100, Math.max(0, Math.round(Math.max(p75, current))));
}
