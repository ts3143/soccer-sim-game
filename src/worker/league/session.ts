/**
 * League saves: creating, deleting and opening them. The worker keeps one league open
 * at a time, with its current data in the in-memory cache (SPEC §12).
 */
import type { IDBPDatabase } from "idb";
import type { NewLeagueInput } from "../../common/api";
import { clubDefinitions } from "../../common/config/clubs";
import type { LeagueSummary } from "../../common/schema";
import { Cache } from "../db/cache";
import { listLeagues, registerLeague, unregisterLeague } from "../db/globalDb";
import { deleteLeagueDb, openLeagueDb, writeWorld } from "../db/leagueDb";
import type { LeagueDBSchema } from "../db/schema";
import { generateWorld } from "../generate/world";

export interface LeagueSession {
  lid: number;
  db: IDBPDatabase<LeagueDBSchema>;
  cache: Cache<LeagueDBSchema>;
}

/** Stores loaded into memory when a league is opened. */
const CACHED_STORES = ["meta", "competitions", "clubs", "clubSeasons", "players"] as const;

let current: Promise<LeagueSession> | null = null;
let currentLid: number | null = null;

/** A fresh random seed for a new league. The seed source isn't game logic; play uses it. */
function newSeed(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function createLeague(input: NewLeagueInput): Promise<LeagueSummary> {
  const club = clubDefinitions[input.userCid];
  if (!club) throw new RangeError(`Unknown club ${input.userCid}`);
  const name = input.name.trim() || `League ${(await listLeagues()).length + 1}`;
  const createdAt = new Date().toISOString();
  const world = generateWorld({
    seed: input.seed.trim() || newSeed(),
    name,
    userCid: input.userCid,
    createdAt,
  });

  const league = await registerLeague({
    name,
    createdAt,
    lastPlayedAt: createdAt,
    clubName: club.name,
    season: world.meta.game.season,
  });
  try {
    await deleteLeagueDb(league.lid); // in case an old database with this ID survived
    const db = await openLeagueDb(league.lid);
    await writeWorld(db, world);
    db.close();
  } catch (error) {
    await unregisterLeague(league.lid);
    await deleteLeagueDb(league.lid).catch(() => undefined);
    throw error;
  }
  return league;
}

export async function deleteLeague(lid: number): Promise<void> {
  if (currentLid === lid) await closeLeague();
  await deleteLeagueDb(lid);
  await unregisterLeague(lid);
}

/** Opens a league (loading its current data into memory), closing any other. */
export function openLeague(lid: number): Promise<LeagueSession> {
  if (current && currentLid === lid) return current;
  const previous = current;
  currentLid = lid;
  current = (async () => {
    if (previous) await close(previous);
    if (!(await listLeagues()).some((l) => l.lid === lid)) throw new RangeError(`No league ${lid}`);
    const db = await openLeagueDb(lid);
    return { lid, db, cache: await Cache.open(db, CACHED_STORES) };
  })().catch((error: unknown) => {
    current = null;
    currentLid = null;
    throw error;
  });
  return current;
}

export async function closeLeague(): Promise<void> {
  const session = current;
  current = null;
  currentLid = null;
  if (session) await close(session);
}

async function close(session: Promise<LeagueSession>): Promise<void> {
  const open = await session.catch(() => null);
  if (!open) return;
  await open.cache.flush();
  open.db.close();
}
