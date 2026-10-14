import type { Plugin } from "vite";

/**
 * Removes every `based_on` field (the real club a fictional club mirrors) from the
 * club data when Vite bundles it, so real club names never ship to the browser
 * (SPEC §6.1). The data file in the repo keeps the field as a dev reference.
 */
export function stripBasedOn(): Plugin {
  return {
    name: "soccer-sim-game:strip-based-on",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0]?.endsWith("/data/clubs_2026_27.json")) return null;
      const data = JSON.parse(code) as unknown;
      return { code: JSON.stringify(removeBasedOn(data)), map: null };
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
