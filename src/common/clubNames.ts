/**
 * A names file (SPEC §17.3; ZenGM's idea): a JSON file of the user's own, loaded at New
 * game, that renames clubs of the world he picks, written into that save only. The game
 * never ships one; it only reads one he brings. The format, by club id (as in the
 * template New game offers):
 *
 *   { "clubs": { "mbl": { "name": "…", "short": "…", "abbr": "…" }, … } }
 *
 * Any of the three may be left out, and a club left out keeps its names. The New game
 * page checks a file as it's loaded; the worker checks the names again before using them.
 */

/** New names for one club. */
export interface ClubName {
  name?: string;
  short?: string;
  abbr?: string;
}

/** New names by club id (the clubs file's id, a club's `code`). */
export type ClubNames = Record<string, ClubName>;

/** What a club is called (a club definition, a club in a save, a New game choice). */
export interface NamedClub {
  code: string;
  name: string;
  short: string;
  abbr: string;
}

const LIMITS = { name: 40, short: 24 } as const;
const ABBR = /^[A-Z0-9]{2,4}$/;
const FIELDS = ["name", "short", "abbr"] as const;
const MAX_ERRORS = 8;

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The clubs with their new names (a club left out, or a name left out, unchanged). */
export function applyClubNames<T extends NamedClub>(clubs: readonly T[], names: ClubNames): T[] {
  return clubs.map((c) => {
    const n = names[c.code];
    return n
      ? { ...c, name: n.name ?? c.name, short: n.short ?? c.short, abbr: n.abbr ?? c.abbr }
      : c;
  });
}

/**
 * What's wrong with `names` for these clubs (empty: nothing): an unknown club id or field,
 * a name that isn't text, empty or too long, an abbreviation that isn't 2 to 4 capital
 * letters or digits, or two clubs that would end with the same name or abbreviation.
 */
export function clubNamesProblems(names: unknown, clubs: readonly NamedClub[]): string[] {
  const problems: string[] = [];
  if (!isObject(names)) return ['The file needs a "clubs" object, by club id.'];
  const codes = new Set(clubs.map((c) => c.code));
  for (const [code, entry] of Object.entries(names)) {
    if (!codes.has(code)) {
      problems.push(`There's no club "${code}" in this world.`);
      continue;
    }
    if (!isObject(entry)) {
      problems.push(`"${code}" needs an object with "name", "short" or "abbr".`);
      continue;
    }
    for (const [field, value] of Object.entries(entry)) {
      if (!(FIELDS as readonly string[]).includes(field)) {
        problems.push(`"${code}": unknown field "${field}" (use "name", "short" or "abbr").`);
      } else if (typeof value !== "string" || value.trim() !== value || value === "") {
        problems.push(`"${code}": "${field}" must be text, without spaces at either end.`);
      } else if (field === "abbr" && !ABBR.test(value)) {
        problems.push(`"${code}": "abbr" must be 2 to 4 capital letters or digits.`);
      } else if (field !== "abbr" && value.length > LIMITS[field as "name" | "short"]) {
        problems.push(
          `"${code}": "${field}" is longer than ${LIMITS[field as "name" | "short"]} characters.`,
        );
      }
    }
  }
  if (problems.length > 0) return problems.slice(0, MAX_ERRORS);
  const renamed = applyClubNames(clubs, names as ClubNames);
  for (const field of ["name", "abbr"] as const) {
    const seen = new Map<string, string>();
    for (const c of renamed) {
      const other = seen.get(c[field]);
      if (other) problems.push(`"${other}" and "${c.code}" would both be ${field} "${c[field]}".`);
      seen.set(c[field], c.code);
    }
  }
  return problems.slice(0, MAX_ERRORS);
}

/** Reads a names file's text for these clubs: the names, or what's wrong with it. */
export function readClubNames(
  text: string,
  clubs: readonly NamedClub[],
): { names: ClubNames; problems: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { names: {}, problems: ["The file isn't valid JSON."] };
  }
  const names = isObject(json) ? json.clubs : undefined;
  const problems = clubNamesProblems(names, clubs);
  return { names: problems.length === 0 ? (names as ClubNames) : {}, problems };
}

/** A names file with every club's names as they are: a template to edit. */
export function clubNamesTemplate(clubs: readonly NamedClub[]): string {
  const entries = Object.fromEntries(
    clubs.map((c) => [c.code, { name: c.name, short: c.short, abbr: c.abbr }]),
  );
  return `${JSON.stringify({ clubs: entries }, null, 2)}\n`;
}
