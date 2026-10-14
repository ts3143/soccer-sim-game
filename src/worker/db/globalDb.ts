import { openDB, type IDBPDatabase } from "idb";
import {
  GLOBAL_DB_NAME,
  GLOBAL_DB_VERSION,
  type GlobalDBSchema,
  type LeagueSummary,
} from "./schema";

let globalDb: Promise<IDBPDatabase<GlobalDBSchema>> | undefined;

function openGlobalDb(): Promise<IDBPDatabase<GlobalDBSchema>> {
  globalDb ??= openDB<GlobalDBSchema>(GLOBAL_DB_NAME, GLOBAL_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("leagues", { keyPath: "lid" });
    },
  }).catch((error: unknown) => {
    globalDb = undefined;
    throw error;
  });
  return globalDb;
}

export async function listLeagues(): Promise<LeagueSummary[]> {
  return (await openGlobalDb()).getAll("leagues");
}

/** Registers a new league save and returns it. League IDs are 1, 2, 3, … */
export async function createLeague(name: string, now: string): Promise<LeagueSummary> {
  const db = await openGlobalDb();
  const tx = db.transaction("leagues", "readwrite");
  const cursor = await tx.store.openCursor(null, "prev");
  const lid = (cursor?.value.lid ?? 0) + 1;
  const league: LeagueSummary = { lid, name, createdAt: now, lastPlayedAt: now };
  await tx.store.add(league);
  await tx.done;
  return league;
}
