import type { IDBPTransaction, StoreNames } from "idb";
import type { Position } from "../../common/config/ratings";
import { worlds } from "../../common/config/worlds";
import type { PlayerMatchStats } from "../../common/match";
import { COEFFICIENTS } from "../engine/coefficients";
import {
  manOfTheMatch,
  ratingFromOldScale,
  ratingTotalFromOldScale,
  winningSide,
} from "../engine/ratings";
import type { GameMeta } from "../../common/schema";
import { bornLocally } from "../generate/birthplace";
import { withAutoLineup } from "../club/tactics";
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

/**
 * League DB v5: local lads (T, 2026-10-25). About half of the academy players and academy
 * graduates of a club's own country are born in the club's city, the same ones a new world
 * from this seed would pick. Birthplaces weren't shown before, so nothing seen changes.
 */
export async function upgradeToV5(tx: UpgradeTransaction): Promise<void> {
  const game = (await tx.objectStore("meta").get("game")) as GameMeta | undefined;
  if (!game) return;
  const clubs = new Map((await tx.objectStore("clubs").getAll()).map((c) => [c.cid, c]));
  let player = await tx.objectStore("players").openCursor();
  while (player) {
    const row = player.value;
    if (bornLocally(game.seed, [row], clubs).length > 0) await player.update(row);
    player = await player.continue();
  }
}

/**
 * League DB v6: injury histories (T, 2026-10-25). Players' injuries are recorded from now
 * on: the save notes the day (its current game date), and profiles say "since" it.
 */
export async function upgradeToV6(tx: UpgradeTransaction): Promise<void> {
  const meta = tx.objectStore("meta");
  const game = (await meta.get("game")) as GameMeta | undefined;
  if (!game || game.injuriesSince) return;
  await meta.put({ ...game, injuriesSince: game.date }, "game");
}

/**
 * League DB v7: the user's club always has a saved line-up (T, 2026-10-25). An older save
 * without one gets the AI's pick on its current date, as a new league does. If that pick
 * can't be made, the save opens without one (the Tactics page then shows the AI's pick).
 */
export async function upgradeToV7(tx: UpgradeTransaction): Promise<void> {
  const game = (await tx.objectStore("meta").get("game")) as GameMeta | undefined;
  if (typeof game?.userCid !== "number") return;
  const clubs = tx.objectStore("clubs");
  const club = await clubs.get(game.userCid);
  if (!club?.tactics || club.tactics.lineup) return;
  const players = await tx.objectStore("players").index("cid").getAll(game.userCid);
  let next: typeof club;
  try {
    // Saves from before v7 are all Classic (SPEC §17.1).
    next = withAutoLineup(club, players, game.date, worlds.classic.competitions);
  } catch {
    return;
  }
  await clubs.put(next);
}
