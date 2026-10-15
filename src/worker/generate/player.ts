/**
 * Player generator (SPEC §4): bio, 22 ratings shaped by position, height and weight,
 * preferred foot, hidden ceiling, curve type and traits. Ratings are generated around
 * a target quality, then shifted so the OVR at the generated position equals it.
 */
import { addDays, addYears } from "../../common/dates";
import { nationalitiesConfig } from "../../common/config/nationalities";
import {
  RATING_CODES,
  RATING_COUNT,
  RATING_INDEX,
  ratingsConfig,
  type Position,
  type RatingCode,
  type Side,
} from "../../common/config/ratings";
import type { CurveType, Foot, MoodTrait, Player, PlayerStatus } from "../../common/schema";
import { bestPosition, positionOvrs, rawPositionOvr, secondaryPositions } from "../core/ovr";
import type { Random } from "../core/random";
import { sampleIdentity } from "./identity";

// ---------------------------------------------------------------------------
// Ratings

/** Mean height (cm) by position; sd 5.5 (GK 4.5). */
const HEIGHT_CM: Record<Position, number> = {
  GK: 190, CB: 188, FB: 178, WB: 177, DM: 182, CM: 179, WM: 177, AM: 175, W: 175, ST: 183,
}; // prettier-ignore

/** Height rating ↔ centimetres: 160 cm = 0, 205 cm = 100. */
export const heightToRating = (cm: number): number => Math.round((cm - 160) / 0.45);

/** Rating level relative to quality by position weight (heavy, medium, light). */
const WEIGHTED_LEVEL = {
  heavy: { offset: 3, sd: 5 },
  medium: { offset: -3, sd: 6 },
  light: { offset: -9, sd: 7 },
};
const levelForWeight = (weight: number) =>
  weight >= 3 ? WEIGHTED_LEVEL.heavy : weight === 2 ? WEIGHTED_LEVEL.medium : WEIGHTED_LEVEL.light;

/** Outfield-player levels for ratings his position doesn't weigh. */
const outfieldUnweighted = (code: RatingCode, q: number): { mean: number; sd: number } => {
  if (code === "gkr" || code === "gko" || code === "gkh") return { mean: 10, sd: 5 };
  if (code === "stp") return { mean: 0.5 * q + 10, sd: 13 };
  if (code === "pen") return { mean: 0.45 * q + 18, sd: 11 };
  return { mean: 0.55 * q + 12, sd: 9 };
};

/** Goalkeeper levels for ratings the GK position doesn't weigh. */
const GK_UNWEIGHTED: Partial<Record<RatingCode, { mean: number; sd: number }>> = {
  fin: { mean: 15, sd: 6 }, lsh: { mean: 20, sd: 7 }, hdr: { mean: 25, sd: 8 }, drb: { mean: 22, sd: 8 },
  crs: { mean: 18, sd: 7 }, tkl: { mean: 22, sd: 8 }, stp: { mean: 25, sd: 8 }, pen: { mean: 30, sd: 10 },
  oiq: { mean: 30, sd: 8 }, diq: { mean: 45, sd: 9 }, wrk: { mean: 45, sd: 9 }, ant: { mean: 50, sd: 9 },
  spd: { mean: 38, sd: 8 }, end: { mean: 42, sd: 8 },
}; // prettier-ignore

const GROUP_STYLE_SD = { physical: 4, technical: 3, mental: 3, goalkeeping: 0, fixed: 0 };

/** Age shape at generation: youngsters are less mature, veterans slower but wiser. */
function ageAdjustment(code: RatingCode, age: number): number {
  const group = ratingsConfig.ageCurveGroupOf[code];
  if (group === "mental") return Math.max(-8, Math.min(7, (age - 25) * 1.0));
  if ((code === "spd" || code === "end") && age > 29) return -(age - 29) * 1.8;
  if (code === "str" && age < 21) return -(21 - age) * 2;
  return 0;
}

const clampRating = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * Ratings for a player of `quality` at `position`. With `exact` (the default) they are
 * shifted so the OVR at that position equals `quality`; without it they are the raw
 * position profile (used once, to fit the OVR scaling constants).
 */
export function generateRatings(
  rng: Random,
  position: Position,
  quality: number,
  age: number,
  heightCm: number,
  exact = true,
): number[] {
  const weights = ratingsConfig.positions[position].weights;
  const style = {
    physical: rng.normal(0, GROUP_STYLE_SD.physical),
    technical: rng.normal(0, GROUP_STYLE_SD.technical),
    mental: rng.normal(0, GROUP_STYLE_SD.mental),
    goalkeeping: 0,
    fixed: 0,
  };

  const ratings = RATING_CODES.map((code) => {
    if (code === "hgt") return clampRating(heightToRating(heightCm));
    const weight = weights[code] ?? 0;
    let level: { mean: number; sd: number };
    if (weight > 0) {
      const w = levelForWeight(weight);
      level = { mean: quality + w.offset, sd: w.sd };
    } else if (position === "GK") {
      level = GK_UNWEIGHTED[code] ?? { mean: 0.5 * quality + 15, sd: 8 };
      if (code === "str") level = { mean: 50 + 0.3 * (quality - 50), sd: 8 };
    } else {
      level = outfieldUnweighted(code, quality);
    }
    const group = ratingsConfig.ageCurveGroupOf[code];
    return clampRating(rng.normal(level.mean, level.sd) + style[group] + ageAdjustment(code, age));
  });

  if (exact) {
    const scale = ratingsConfig.ovrScaling[position].scale;
    for (let i = 0; i < 6; i++) {
      const diff = quality - rawPositionOvr(ratings, position);
      if (Math.abs(diff) < 0.2) break;
      for (const code of Object.keys(weights) as RatingCode[]) {
        if (code === "hgt") continue;
        const index = RATING_INDEX[code];
        ratings[index] = clampRating((ratings[index] as number) + diff / scale);
      }
    }
  }
  return ratings.map(Math.round);
}

// ---------------------------------------------------------------------------
// Player

export interface PlayerSpec {
  /** Position the player is generated for (his listed position is whatever he's best at). */
  position: Position;
  /** Side of the slot he's generated for: sets the preferred-foot odds. */
  side: Side;
  /** Target OVR at `position`. */
  quality: number;
  /** Whole years of age on the season start date. */
  age: number;
  nationality: string;
  status: PlayerStatus;
  cid: number | null;
}

const CURVE_TYPES: [CurveType, number][] = [
  ["normal", 70],
  ["early", 10],
  ["late", 10],
  ["ageless", 10],
];
const MOOD_TRAITS: MoodTrait[] = ["fame", "loyalty", "money", "winning"];
/** Judgment calls (PROGRESS.md): trait rates and mood-trait counts. */
export const TRAIT_RATES = { injuryProne: 0.1, hothead: 0.08, moodTraitCounts: [35, 45, 20] };

/** Hidden ceiling headroom above current OVR, by age: large for teenagers, ~0 from 27. */
function ceilingHeadroom(rng: Random, age: number): number {
  const mean = Math.max(0, 2.2 * (27 - age));
  return Math.max(0, rng.normal(mean, 0.45 * mean + 1.5));
}

export function generatePlayer(
  rng: Random,
  spec: PlayerSpec,
  pid: number,
  season: number,
  seasonStart: string,
): Player {
  const identity = sampleIdentity(rng, spec.nationality);
  const sd = spec.position === "GK" ? 4.5 : 5.5;
  const heightCm = Math.round(
    Math.min(203, Math.max(163, rng.normal(HEIGHT_CM[spec.position], sd))),
  );
  const leftShare = nationalitiesConfig.preferredFoot.leftShareBySlotSide[spec.side];
  const foot: Foot = rng.bool(leftShare) ? "L" : "R";

  const ratings = generateRatings(rng, spec.position, spec.quality, spec.age, heightCm);
  const strength = ratings[RATING_INDEX.str] as number;
  const bmi = rng.normal(23.2, 1.2) + (strength - 50) * 0.02;
  const weightKg = Math.round(bmi * (heightCm / 100) ** 2);

  const ovrs = positionOvrs(ratings);
  const position = bestPosition(ovrs);
  const ovr = Math.max(...ovrs);
  const ceiling = Math.min(98, Math.round(ovr + ceilingHeadroom(rng, spec.age)));

  const traitCount = rng.weightedIndex(TRAIT_RATES.moodTraitCounts);
  const moodTraits = rng.shuffle(MOOD_TRAITS).slice(0, traitCount).sort();
  const birthDate = addDays(addYears(seasonStart, -spec.age), -rng.int(0, 364));

  return {
    pid,
    firstName: identity.firstName,
    lastName: identity.lastName,
    nationality: identity.nationality,
    nationality2: identity.nationality2,
    birthDate,
    birthplace: identity.birthplace,
    heightCm,
    weightKg,
    foot,
    position,
    secondaryPositions: secondaryPositions(ovrs, position),
    shirtNumber: null,
    ratingsHistory: [{ season, date: seasonStart, ratings, ovr, pot: ovr }],
    ovrs,
    ovr,
    pot: ovr,
    hidden: {
      ceiling,
      curve: rng.weighted(CURVE_TYPES, ([, w]) => w)[0],
      injuryProne: rng.bool(TRAIT_RATES.injuryProne),
      hothead: rng.bool(TRAIT_RATES.hothead),
    },
    moodTraits,
    status: spec.status,
    cid: spec.cid,
    loan: null,
    contract: null,
    injury: null,
    condition: 100,
    conditionDate: null,
    transfers: [],
    freeAgentSince: spec.status === "freeAgent" ? seasonStart : null,
    retiredSeason: null,
  };
}

/** Replaces a player's ratings (after tuning) and refreshes everything derived from them. */
export function setRatings(player: Player, ratings: number[]): void {
  if (ratings.length !== RATING_COUNT) throw new Error("setRatings: need 22 ratings");
  const ovrs = positionOvrs(ratings);
  const position = bestPosition(ovrs);
  const ovr = Math.max(...ovrs);
  const entry = player.ratingsHistory[player.ratingsHistory.length - 1];
  if (entry) {
    entry.ratings = ratings;
    entry.ovr = ovr;
  }
  player.ovrs = ovrs;
  player.ovr = ovr;
  player.position = position;
  player.secondaryPositions = secondaryPositions(ovrs, position);
  player.hidden.ceiling = Math.max(player.hidden.ceiling, ovr);
}
