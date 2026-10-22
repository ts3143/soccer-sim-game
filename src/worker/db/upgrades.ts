import type { IDBPTransaction, StoreNames } from "idb";
import type { PlayerMatchStats } from "../../common/match";
import { COEFFICIENTS } from "../engine/coefficients";
import { ratingFromOldScale, ratingTotalFromOldScale } from "../engine/ratings";
import type { LeagueDBSchema } from "./schema";

type UpgradeTransaction = IDBPTransaction<
  LeagueDBSchema,
  ArrayLike<StoreNames<LeagueDBSchema>>,
  "versionchange"
>;

/** Player match stats as saves before v3 hold them (no post-shot xG for keepers). */
type OldPlayerStats = Omit<PlayerMatchStats, "psxgFaced"> & { psxgFaced?: number };

/** Keepers' post-shot xG where it wasn't recorded: neutral, as many as they conceded. */
function fillPsxg(p: OldPlayerStats): void {
  p.psxgFaced ??= p.position === "GK" ? p.goalsConceded : 0;
}

/**
 * League DB v3: match ratings move to the 6.9-centred scale (SPEC §8.7; T, 2026-10-21).
 * Rescales box scores, season stat rows and players' half-season tallies once, inside the
 * upgrade transaction (all or nothing). A match being watched live keeps going; its
 * ratings are worked out at full time on the new scale.
 */
export async function upgradeToV3(tx: UpgradeTransaction): Promise<void> {
  let match = await tx.objectStore("matches").openCursor();
  while (match) {
    const row = match.value;
    for (const p of row.result.players as OldPlayerStats[]) {
      p.rating = ratingFromOldScale(p.rating, COEFFICIENTS);
      fillPsxg(p);
    }
    await match.update(row);
    match = await match.continue();
  }

  let stats = await tx.objectStore("playerStats").openCursor();
  while (stats) {
    const row = stats.value;
    row.ratingTotal = ratingTotalFromOldScale(row.ratingTotal, row.appearances, COEFFICIENTS);
    await stats.update(row);
    stats = await stats.continue();
  }

  let player = await tx.objectStore("players").openCursor();
  while (player) {
    const row = player.value;
    if (row.devTally) {
      const { ratingTotal, appearances } = row.devTally;
      row.devTally.ratingTotal = ratingTotalFromOldScale(ratingTotal, appearances, COEFFICIENTS);
      await player.update(row);
    }
    player = await player.continue();
  }

  const meta = tx.objectStore("meta");
  const live = (await meta.get("live")) as
    { state: { teams: { all: { stats: OldPlayerStats }[] }[] } } | undefined;
  if (live) {
    for (const team of live.state.teams) for (const p of team.all) fillPsxg(p.stats);
    await meta.put(live, "live");
  }
}
