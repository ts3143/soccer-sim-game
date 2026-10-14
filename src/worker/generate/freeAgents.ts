/**
 * The seeded free-agent pool at league creation (SPEC §7.5): unattached players, mostly
 * experienced and below the level of a typical second-tier starter.
 */
import { ratingsConfig, type Position, type Side } from "../../common/config/ratings";
import type { Player } from "../../common/schema";
import type { Random } from "../core/random";
import { combinedMix, sampleNationality } from "./identity";
import { generatePlayer } from "./player";

/** Judgment call (PROGRESS.md): ~6% of the club players. */
export const FREE_AGENT_POOL_SIZE = 120;

const POSITIONS_WEIGHTED: [Position, number][] = [
  ["GK", 10], ["CB", 17], ["FB", 12], ["WB", 5], ["DM", 9],
  ["CM", 14], ["WM", 7], ["AM", 7], ["W", 9], ["ST", 10],
]; // prettier-ignore

export function generateFreeAgents(
  rng: Random,
  season: number,
  seasonStart: string,
  nextPid: () => number,
): Player[] {
  const mix = combinedMix();
  return Array.from({ length: FREE_AGENT_POOL_SIZE }, () => {
    const position = rng.weighted(POSITIONS_WEIGHTED, ([, w]) => w)[0];
    const side: Side = ratingsConfig.sidedPositions.includes(position)
      ? rng.choice(["L", "R"] as const)
      : "C";
    const age = Math.min(36, Math.max(20, Math.round(rng.normal(29, 4))));
    const quality = Math.min(64, Math.max(36, rng.normal(50, 6) - Math.max(0, age - 32) * 1.5));
    return generatePlayer(
      rng,
      {
        position,
        side,
        quality,
        age,
        nationality: sampleNationality(rng, mix),
        status: "freeAgent",
        cid: null,
      },
      nextPid(),
      season,
      seasonStart,
    );
  });
}
