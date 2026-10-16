import { deleteDB, openDB, type IDBPDatabase } from "idb";
import {
  GLOBAL_DB_NAME,
  GLOBAL_DB_VERSION,
  leagueDbName,
  type GlobalDBSchema,
  type LeagueSummary,
} from "./schema";

/** The M0 plumbing check page created this save; M1 removes it. */
const LEGACY_DEMO_NAME = "M0 plumbing demo";

let globalDb: Promise<IDBPDatabase<GlobalDBSchema>> | undefined;

function openGlobalDb(): Promise<IDBPDatabase<GlobalDBSchema>> {
  globalDb ??= open().catch((error: unknown) => {
    globalDb = undefined;
    throw error;
  });
  return globalDb;
}

async function open(): Promise<IDBPDatabase<GlobalDBSchema>> {
  let removeLegacyDemo = false;
  const db = await openDB<GlobalDBSchema>(GLOBAL_DB_NAME, GLOBAL_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("leagues", { keyPath: "lid" });
      if (oldVersion === 1) removeLegacyDemo = true;
    },
  });
  if (removeLegacyDemo) {
    for (const league of await db.getAll("leagues")) {
      if (league.name !== LEGACY_DEMO_NAME) continue;
      await db.delete("leagues", league.lid);
      await deleteDB(leagueDbName(league.lid));
    }
  }
  return db;
}

export async function listLeagues(): Promise<LeagueSummary[]> {
  return (await openGlobalDb()).getAll("leagues");
}

/** Registers a new league save and returns it. League IDs are 1, 2, 3, … */
export async function registerLeague(entry: Omit<LeagueSummary, "lid">): Promise<LeagueSummary> {
  const db = await openGlobalDb();
  const tx = db.transaction("leagues", "readwrite");
  const cursor = await tx.store.openCursor(null, "prev");
  const league: LeagueSummary = { lid: (cursor?.value.lid ?? 0) + 1, ...entry };
  await tx.store.add(league);
  await tx.done;
  return league;
}

export async function unregisterLeague(lid: number): Promise<void> {
  await (await openGlobalDb()).delete("leagues", lid);
}

/** Updates a save's list entry (season, last played) after play. */
export async function updateLeagueSummary(
  lid: number,
  patch: Partial<Omit<LeagueSummary, "lid">>,
): Promise<void> {
  const db = await openGlobalDb();
  const tx = db.transaction("leagues", "readwrite");
  const league = await tx.store.get(lid);
  if (league) await tx.store.put({ ...league, ...patch });
  await tx.done;
}
