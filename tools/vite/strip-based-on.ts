import type { Plugin } from "vite";

/**
 * Bundles only the club data the game uses: the `leagues` and `clubs` lists, with every
 * `based_on` field (the real club a fictional club mirrors) removed, so real club names
 * never ship to the browser (SPEC §6.1). The data file in the repo is unchanged.
 */
export function stripBasedOn(): Plugin {
  return {
    name: "soccer-sim-game:strip-based-on",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0]?.endsWith("/data/clubs_2026_27.json")) return null;
      const data = JSON.parse(code) as { leagues: unknown; clubs: unknown };
      const shipped = { leagues: data.leagues, clubs: removeBasedOn(data.clubs) };
      return { code: JSON.stringify(shipped), map: null };
    },
  };
}

function removeBasedOn(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeBasedOn);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "based_on")
        .map(([key, inner]) => [key, removeBasedOn(inner)]),
    );
  }
  return value;
}
