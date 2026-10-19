/**
 * Ratings, positions and OVR config (data/config/ratings_positions.json), typed and
 * validated at load. The 22 rating codes and 10 position groups are fixed by the spec,
 * so they are TypeScript constants; the loader checks the config agrees with them.
 */
import raw from "../../../data/config/ratings_positions.json";

/** Fixed storage order of the 22 ratings (ratings history arrays use this order). */
export const RATING_CODES = [
  "hgt", "str", "spd", "jmp", "end",
  "oiq", "diq", "wrk",
  "fin", "lsh", "hdr", "drb",
  "spa", "lpa", "crs",
  "tkl", "ant",
  "stp", "pen",
  "gkr", "gko", "gkh",
] as const; // prettier-ignore
export type RatingCode = (typeof RATING_CODES)[number];
export const RATING_COUNT = RATING_CODES.length;
export const RATING_INDEX = Object.fromEntries(RATING_CODES.map((code, i) => [code, i])) as Record<
  RatingCode,
  number
>;

/** The 10 position groups, in fixed order (position OVR arrays use this order). */
export const POSITIONS = ["GK", "CB", "FB", "WB", "DM", "CM", "WM", "AM", "W", "ST"] as const;
export type Position = (typeof POSITIONS)[number];
export type Side = "L" | "C" | "R";

export type AgeCurveGroup = "physical" | "technical" | "mental" | "goalkeeping" | "fixed";
export const AGE_CURVE_GROUPS: readonly AgeCurveGroup[] = [
  "physical",
  "technical",
  "mental",
  "goalkeeping",
  "fixed",
];

export interface PositionConfig {
  name: string;
  /** Weight per rating (heavy 3, medium 2, light 1); unlisted ratings weigh 0. */
  weights: Partial<Record<RatingCode, number>>;
}

export interface OvrScaling {
  scale: number;
  offset: number;
}

export interface RatingsConfig {
  ratingNames: Record<RatingCode, string>;
  /** Display group of each rating (Physical, Mental, Attacking, …). */
  ratingGroups: Record<RatingCode, string>;
  /** Which age-curve group each rating develops with. */
  ageCurveGroupOf: Record<RatingCode, AgeCurveGroup>;
  radarAxes: Record<string, RatingCode[]>;
  positions: Record<Position, PositionConfig>;
  sidedPositions: readonly Position[];
  wrongFootPenalty: Partial<Record<Position, number>>;
  ovrScalingFitted: boolean;
  ovrScaling: Record<Position, OvrScaling>;
  ovrBands: { min: number; label: string }[];
}

const isRatingCode = (code: string): code is RatingCode =>
  (RATING_CODES as readonly string[]).includes(code);
const isPosition = (code: string): code is Position =>
  (POSITIONS as readonly string[]).includes(code);

function fail(message: string): never {
  throw new Error(`ratings_positions.json: ${message}`);
}

function parse(json: typeof raw): RatingsConfig {
  const codes = json.ratings.map((r) => r.code);
  if (codes.join() !== RATING_CODES.join()) fail(`rating order must be ${RATING_CODES.join()}`);

  const ageCurveGroupOf = {} as Record<RatingCode, AgeCurveGroup>;
  for (const [group, members] of Object.entries(json.ageCurveGroups)) {
    if (!(AGE_CURVE_GROUPS as readonly string[]).includes(group)) fail(`unknown group ${group}`);
    for (const code of members) {
      if (!isRatingCode(code)) fail(`unknown rating ${code} in ageCurveGroups`);
      if (ageCurveGroupOf[code]) fail(`rating ${code} is in two age-curve groups`);
      ageCurveGroupOf[code] = group as AgeCurveGroup;
    }
  }
  for (const code of RATING_CODES)
    if (!ageCurveGroupOf[code]) fail(`${code} has no age-curve group`);

  const positions = {} as Record<Position, PositionConfig>;
  const scaling = {} as Record<Position, OvrScaling>;
  const scalingJson = json.ovrScaling.positions as Record<string, OvrScaling>;
  for (const position of POSITIONS) {
    const entry = (json.positions as Record<string, { name: string; weights: object }>)[position];
    if (!entry) fail(`missing position ${position}`);
    const weights: Partial<Record<RatingCode, number>> = {};
    for (const [code, weight] of Object.entries(entry.weights as Record<string, number>)) {
      if (!isRatingCode(code)) fail(`unknown rating ${code} in ${position} weights`);
      weights[code] = weight;
    }
    positions[position] = { name: entry.name, weights };
    const s = scalingJson[position];
    if (!s) fail(`missing ovrScaling for ${position}`);
    scaling[position] = { scale: s.scale, offset: s.offset };
  }

  const radarAxes: Record<string, RatingCode[]> = {};
  for (const [axis, members] of Object.entries(json.radarAxes)) {
    if (axis.startsWith("_")) continue;
    radarAxes[axis] = (members as string[]).map((code) =>
      isRatingCode(code) ? code : fail(`unknown rating ${code} in radar axis ${axis}`),
    );
  }

  const wrongFootPenalty: Partial<Record<Position, number>> = {};
  for (const [position, penalty] of Object.entries(json.wrongFootPenalty)) {
    if (position.startsWith("_")) continue;
    if (!isPosition(position)) fail(`unknown position ${position} in wrongFootPenalty`);
    wrongFootPenalty[position] = penalty as number;
  }

  return {
    ratingNames: Object.fromEntries(json.ratings.map((r) => [r.code, r.name])) as Record<
      RatingCode,
      string
    >,
    ratingGroups: Object.fromEntries(json.ratings.map((r) => [r.code, r.group])) as Record<
      RatingCode,
      string
    >,
    ageCurveGroupOf,
    radarAxes,
    positions,
    sidedPositions: json.sidedPositions.map((p) => (isPosition(p) ? p : fail(`bad sided ${p}`))),
    wrongFootPenalty,
    ovrScalingFitted: json.ovrScaling.status === "fitted",
    ovrScaling: scaling,
    ovrBands: [...json.ovrBands].sort((a, b) => b.min - a.min),
  };
}

export const ratingsConfig: RatingsConfig = parse(raw);
