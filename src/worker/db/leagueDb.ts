import { deleteDB, openDB, type IDBPDatabase } from "idb";
import type { World } from "../generate/world";
import { LEAGUE_DB_VERSION, leagueDbName, type LeagueDBSchema } from "./schema";

export function openLeagueDb(lid: number): Promise<IDBPDatabase<LeagueDBSchema>> {
  return openDB<LeagueDBSchema>(leagueDbName(lid), LEAGUE_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("meta");
      if (oldVersion < 2) {
        db.createObjectStore("competitions", { keyPath: "id" });
        db.createObjectStore("clubs", { keyPath: "cid" });
        db.createObjectStore("clubSeasons", { keyPath: ["cid", "season"] }).createIndex(
          "season",
          "season",
        );
        const players = db.createObjectStore("players", { keyPath: "pid" });
        players.createIndex("cid", "cid");
        players.createIndex("status", "status");
        const stats = db.createObjectStore("playerStats", {
          keyPath: ["pid", "season", "cid", "competition"],
        });
        stats.createIndex("season", "season");
        stats.createIndex("pid", "pid");
        const fixtures = db.createObjectStore("fixtures", { keyPath: "fid" });
        fixtures.createIndex("season", "season");
        fixtures.createIndex("date", "date");
        db.createObjectStore("matches", { keyPath: "fid" }).createIndex("season", "season");
        db.createObjectStore("offers", { keyPath: "oid" }).createIndex("pid", "pid");
        const transactions = db.createObjectStore("transactions", { keyPath: "xid" });
        transactions.createIndex("season", "season");
        transactions.createIndex("pids", "pids", { multiEntry: true });
        db.createObjectStore("inbox", { keyPath: "mid" });
        db.createObjectStore("awards", { keyPath: "aid" }).createIndex("season", "season");
      }
    },
    blocking(_currentVersion, _blockedVersion, event) {
      // A newer version of the game wants to upgrade this save: let it.
      (event.target as IDBDatabase).close();
    },
  });
}

export function deleteLeagueDb(lid: number): Promise<void> {
  return deleteDB(leagueDbName(lid));
}

/** Writes a freshly generated world into an empty league database, in one transaction. */
export async function writeWorld(db: IDBPDatabase<LeagueDBSchema>, world: World): Promise<void> {
  const tx = db.transaction(
    ["meta", "competitions", "clubs", "clubSeasons", "players"],
    "readwrite",
  );
  const writes: Promise<unknown>[] = [];
  for (const [key, value] of Object.entries(world.meta)) {
    writes.push(tx.objectStore("meta").put(value, key));
  }
  for (const row of world.competitions) writes.push(tx.objectStore("competitions").put(row));
  for (const row of world.clubs) writes.push(tx.objectStore("clubs").put(row));
  for (const row of world.clubSeasons) writes.push(tx.objectStore("clubSeasons").put(row));
  for (const row of world.players) writes.push(tx.objectStore("players").put(row));
  await Promise.all([...writes, tx.done]);
}
