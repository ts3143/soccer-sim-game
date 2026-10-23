import type { IDBPTransaction, StoreNames } from "idb";
import type { Position } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import { COEFFICIENTS } from "../engine/coefficients";
import {
  manOfTheMatch,
  ratingFromOldScale,
  ratingTotalFromOldScale,
  winningSide,
} from "../engine/ratings";
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
      p.rating = ratingFromOldScale(p.rating, p.position, COEFFICIENTS);
      fillPsxg(p);
    }
    await match.update(row);
    match = await match.continue();
  }

  // Season totals and tallies on the scale of the player's position (keepers average lower).
  const positions = new Map<number, Position>();
  let player = await tx.objectStore("players").openCursor();
  while (player) {
    const row = player.value;
    positions.set(row.pid, row.position);
    if (row.devTally) {
      const { ratingTotal, appearances } = row.devTally;
      row.devTally.ratingTotal = ratingTotalFromOldScale(
        ratingTotal,
        appearances,
        row.position,
        COEFFICIENTS,
      );
      await player.update(row);
    }
    player = await player.continue();
  }

  let stats = await tx.objectStore("playerStats").openCursor();
  while (stats) {
    const row = stats.value;
    const position = positions.get(row.pid) ?? "CM";
    row.ratingTotal = ratingTotalFromOldScale(
      row.ratingTotal,
      row.appearances,
      position,
      COEFFICIENTS,
    );
    await stats.update(row);
    stats = await stats.continue();
  }

  const meta = tx.objectStore("meta");
  const live = (await meta.get("live")) as
    { state: { teams: { all: { stats: OldPlayerStats }[] }[] } } | undefined;
  if (live) {
    for (const team of live.state.teams) for (const p of team.all) fillPsxg(p.stats);
    await meta.put(live, "live");
  }
}

/**
 * League DB v4: man of the match (SPEC §8.7; T, 2026-10-23). Names him in every saved match
 * record and counts the awards on the season stat rows. Other clubs' records older than two
 * seasons were pruned before, so those seasons' counts are short; the user's clubs' matches
 * are all kept, so theirs are complete.
 */
export async function upgradeToV4(tx: UpgradeTransaction): Promise<void> {
  const counts = new Map<string, number>();
  const key = (pid: number, season: number, cid: number, competition: string) =>
    `${pid}|${season}|${cid}|${competition}`;
  let match = await tx.objectStore("matches").openCursor();
  while (match) {
    const row = match.value;
    const motm = manOfTheMatch(row.result.players, winningSide(row.result));
    row.result.motm = motm;
    const p = row.result.players.find((x) => x.pid === motm);
    if (p) {
      const k = key(p.pid, row.season, p.side === 0 ? row.homeCid : row.awayCid, row.competition);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    await match.update(row);
    match = await match.continue();
  }

  let stats = await tx.objectStore("playerStats").openCursor();
  while (stats) {
    const row = stats.value;
    row.motm = counts.get(key(row.pid, row.season, row.cid, row.competition)) ?? 0;
    await stats.update(row);
    stats = await stats.continue();
  }
}
