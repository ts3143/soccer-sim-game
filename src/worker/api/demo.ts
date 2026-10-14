import type { IDBPDatabase } from "idb";
import { Cache } from "../db/cache";
import { createLeague, listLeagues } from "../db/globalDb";
import { openLeagueDb } from "../db/leagueDb";
import type { LeagueDBSchema } from "../db/schema";

/**
 * M0 plumbing demo: a throwaway league save holding one counter, exercising the
 * whole path UI → worker → cache → IndexedDB. Replaced by real leagues in M1.
 */
const DEMO_LEAGUE_NAME = "M0 plumbing demo";
const COUNTER_KEY = "demoCounter";

interface DemoSession {
  lid: number;
  cache: Cache<LeagueDBSchema>;
}

let session: Promise<DemoSession> | undefined;

function getSession(): Promise<DemoSession> {
  session ??= openSession().catch((error: unknown) => {
    session = undefined; // allow a retry, e.g. after storage was unblocked
    throw error;
  });
  return session;
}

async function openSession(): Promise<DemoSession> {
  const existing = (await listLeagues()).find((league) => league.name === DEMO_LEAGUE_NAME);
  const league = existing ?? (await createLeague(DEMO_LEAGUE_NAME, new Date().toISOString()));
  const db: IDBPDatabase<LeagueDBSchema> = await openLeagueDb(league.lid);
  return { lid: league.lid, cache: await Cache.open(db, ["meta"]) };
}

function readCounter(cache: Cache<LeagueDBSchema>): number {
  const value = cache.get("meta", COUNTER_KEY);
  return typeof value === "number" ? value : 0;
}

export async function getDemoCounter(): Promise<number> {
  return readCounter((await getSession()).cache);
}

export async function incrementDemoCounter(by: number): Promise<number> {
  if (!Number.isInteger(by)) throw new RangeError("incrementDemoCounter needs a whole number");
  const { cache } = await getSession();
  const value = readCounter(cache) + by;
  cache.put("meta", value, COUNTER_KEY);
  await cache.flush();
  return value;
}
