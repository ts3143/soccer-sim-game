/**
 * Local academy players (T, 2026-10-25). Every player's birthplace is drawn with his name
 * (data/names: where real footballers of his nationality were born); about half of a
 * club's academy players from the club's own country are born in the club's city instead.
 * That coin has its own stream per player, so nothing else in the world shifts, and an
 * older save upgraded to it gets what a new world would.
 */
import type { Club, Player } from "../../common/schema";
import { Random } from "../core/random";

/** Share of a club's home-country academy players born in the club's city. */
export const LOCAL_SHARE = 0.5;

type Home = Pick<Club, "city" | "country">;

/** The club's city if he's a local lad of its academy, else null. */
export function localBirthplace(
  seed: string,
  p: Pick<Player, "pid" | "nationality">,
  academy: Home,
): string | null {
  if (academy.country !== p.nationality) return null;
  return Random.fromSeed(`${seed}/birthplace/${p.pid}`).bool(LOCAL_SHARE) ? academy.city : null;
}

/**
 * Makes academy players local lads where the coin says so: those in a club's academy, and
 * (for an older save) those its academy promoted. Returns the players changed.
 */
export function bornLocally(
  seed: string,
  players: Iterable<Player>,
  clubs: ReadonlyMap<number, Home>,
): Player[] {
  const changed: Player[] = [];
  for (const p of players) {
    const cid =
      p.status === "academy"
        ? p.cid
        : (p.transfers.find((t) => t.type === "academyPromotion")?.toCid ?? null);
    const academy = cid === null ? undefined : clubs.get(cid);
    const city = academy ? localBirthplace(seed, p, academy) : null;
    if (city === null || city === p.birthplace) continue;
    p.birthplace = city;
    changed.push(p);
  }
  return changed;
}
