/**
 * How the 22 ratings are laid out in the ratings card and on the profile (T, 2026-10-23):
 * FM-style columns of the config's display groups, each rating marked by how much it counts
 * towards the OVR of the position being looked at. Display only.
 */
import {
  RATING_CODES,
  ratingsConfig,
  type Position,
  type RatingCode,
} from "../common/config/ratings";

/** Display groups top to bottom in each column. */
export const RATING_COLUMNS: readonly (readonly string[])[] = [
  ["Technical"],
  ["Mental", "Set pieces"],
  ["Physical", "Goalkeeping"],
];

/** Heavy-weight ratings are key for a position, medium-weight ones useful; the rest plain. */
export type RatingImportance = "key" | "useful" | null;

export interface RatingRow {
  code: RatingCode;
  /** Storage index into a player's ratings array. */
  index: number;
  label: string;
  /** The full config name, for the tooltip. */
  name: string;
  importance: RatingImportance;
}

export interface RatingGroup {
  title: string;
  rows: RatingRow[];
}

/** "Dribbling (incl. first touch)" → "Dribbling"; "GK reflexes" → "Reflexes" (under Goalkeeping). */
export function shortRatingName(name: string) {
  return name.replace(/\s*\(.*\)$/, "").replace(/^GK (\w)/, (_, c: string) => c.toUpperCase());
}

export function importance(code: RatingCode, position: Position | null): RatingImportance {
  const weight = position ? (ratingsConfig.positions[position].weights[code] ?? 0) : 0;
  return weight >= 3 ? "key" : weight === 2 ? "useful" : null;
}

/** The columns of groups for a player at `position`; ratings keep their storage order. */
export function ratingColumns(position: Position | null): RatingGroup[][] {
  return RATING_COLUMNS.map((column) =>
    column.map((title) => ({
      title,
      rows: RATING_CODES.flatMap((code, index) =>
        ratingsConfig.ratingGroups[code] === title
          ? [
              {
                code,
                index,
                label: shortRatingName(ratingsConfig.ratingNames[code]),
                name: ratingsConfig.ratingNames[code],
                importance: importance(code, position),
              },
            ]
          : [],
      ),
    })),
  );
}
