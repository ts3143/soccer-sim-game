import type { Player } from "./schema";

/** Compare with the final recorded ratings of the previous season, not the winter update. */
export function ratingChanges(p: Pick<Player, "ovr" | "pot" | "ratingsHistory">, season: number) {
  const before = p.ratingsHistory.findLast((h) => h.season < season);
  return {
    ovrChange: before ? p.ovr - before.ovr : null,
    potChange: before ? p.pot - before.pot : null,
  };
}
