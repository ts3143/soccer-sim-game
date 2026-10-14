import { readdirSync, readFileSync } from "node:fs";

interface RawClub {
  based_on: string;
  city: string;
}

/** Matches the `based_on` field as an object key (in JSON or minified JS), not prose. */
export const BASED_ON_FIELD = /\bbased_on["'`]?\s*:/;

/**
 * The real club names from the data file's dev-only `based_on` field, for the bundle
 * and save checks. Names that legitimately appear in the game are left out: a club's
 * city ("Liverpool"), or a person's name or birthplace in data/names ("Everton" is a
 * Brazilian first name). Node tooling only; never ships.
 */
export function realClubNamesToCheck(): { names: string[]; skipped: string[] } {
  const raw = JSON.parse(
    readFileSync(new URL("../data/clubs_2026_27.json", import.meta.url), "utf8"),
  ) as { clubs: RawClub[] };
  const legitimate = new Set(raw.clubs.map((c) => c.city));
  const namesDir = new URL("../data/names/", import.meta.url);
  for (const file of readdirSync(namesDir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(new URL(file, namesDir), "utf8")) as Record<
      string,
      unknown
    >;
    for (const list of [data.given, data.family, data.birthplaces]) {
      for (const [label] of list as [string, number][]) legitimate.add(label);
    }
  }
  const all = raw.clubs.map((c) => c.based_on);
  return {
    names: all.filter((name) => !legitimate.has(name)),
    skipped: all.filter((name) => legitimate.has(name)),
  };
}
