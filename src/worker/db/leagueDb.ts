import { openDB, type IDBPDatabase } from "idb";
import { LEAGUE_DB_VERSION, leagueDbName, type LeagueDBSchema } from "./schema";

export function openLeagueDb(lid: number): Promise<IDBPDatabase<LeagueDBSchema>> {
  return openDB<LeagueDBSchema>(leagueDbName(lid), LEAGUE_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("meta");
    },
    blocking(_currentVersion, _blockedVersion, event) {
      // A newer version of the game wants to upgrade this save: let it.
      (event.target as IDBDatabase).close();
    },
  });
}
