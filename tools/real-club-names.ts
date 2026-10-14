import { readFileSync } from "node:fs";

interface RawClub {
  based_on: string;
  city: string;
}

/**
 * The real club names from the data file's dev-only `based_on` field, minus any that
 * are also a club's city (those legitimately appear in the game). Used by the bundle
 * and save checks; this file is Node tooling only and never ships.
 */
export function realClubNamesToCheck(): string[] {
  const raw = JSON.parse(
    readFileSync(new URL("../data/clubs_2026_27.json", import.meta.url), "utf8"),
  ) as { clubs: RawClub[] };
  const cities = new Set(raw.clubs.map((c) => c.city));
  return raw.clubs.map((c) => c.based_on).filter((name) => !cities.has(name));
}
