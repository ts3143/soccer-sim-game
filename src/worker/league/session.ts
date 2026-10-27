/**
 * League saves: creating, deleting and opening them. The worker keeps one league open
 * at a time, with its current data in the in-memory cache (SPEC §12).
 */
import type { IDBPDatabase } from "idb";
import type { NewLeagueInput } from "../../common/api";
import { type WorldConfig, worlds } from "../../common/config/worlds";
import type { GameMeta, LeagueSummary } from "../../common/schema";
import { Cache } from "../db/cache";
import { listLeagues, registerLeague, unregisterLeague } from "../db/globalDb";
import { deleteLeagueDb, openLeagueDb, writeWorld } from "../db/leagueDb";
import type { LeagueDBSchema } from "../db/schema";
import { generateWorld } from "../generate/world";
import { withAutoLineup } from "../club/tactics";
import { GameError, LEAGUE_CLOSED } from "../../common/errors";
import { ensureSeason, whenIdle } from "./game";

export interface LeagueSession {
  lid: number;
  db: IDBPDatabase<LeagueDBSchema>;
  cache: Cache<LeagueDBSchema>;
  /** The save's world (SPEC §17.1): its clubs, competitions and switches. */
  config: WorldConfig;
  /** Set once the league is closed (another opened): actions still queued for it stop. */
  closed?: boolean;
}

/**
 * Stores loaded into memory when a league is opened. The season-scoped ones (fixtures,
 * match records, player stats, transactions, awards) load the current season only;
 * past seasons are read from IndexedDB when needed (SPEC §12).
 */
const CACHED_STORES = [
  "meta",
  "competitions",
  "clubs",
  "clubSeasons",
  "players",
  "fixtures",
  "matches",
  "playerStats",
  "transactions",
  "awards",
  "inbox",
  "offers",
] as const;
const SEASON_SCOPED = ["fixtures", "matches", "playerStats", "transactions", "awards"] as const;

async function openCache(db: IDBPDatabase<LeagueDBSchema>): Promise<Cache<LeagueDBSchema>> {
  const game = (await db.get("meta", "game")) as GameMeta | undefined;
  if (!game) {
    throw new GameError(
      "This league's save is incomplete: the page was probably closed while it was being created. Delete it on Manage Leagues and start a new one.",
    );
  }
  const partial = Object.fromEntries(
    SEASON_SCOPED.map((store) => [store, { index: "season", value: game.season }]),
  );
  return Cache.open(db, CACHED_STORES, partial);
}

let current: Promise<LeagueSession> | null = null;
let currentLid: number | null = null;
let openedListener: ((lid: number) => void) | null = null;
/** The league a tab last opened on purpose; other leagues' calls are refused (see claimLeague). */
let claimed: number | null = null;

/** Called each time the worker opens a league (it keeps one open at a time). */
export function onLeagueOpened(listener: (lid: number) => void): void {
  openedListener = listener;
}

/** A fresh random seed for a new league. The seed source isn't game logic; play uses it. */
function newSeed(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function createLeague(input: NewLeagueInput): Promise<LeagueSummary> {
  const config = worlds.classic;
  const club = config.clubs[input.userCid];
  if (!club) throw new RangeError(`Unknown club ${input.userCid}`);
  if (input.name.trim().length > 60) throw new GameError("A league name has 1 to 60 characters.");
  const name = input.name.trim() || `League ${(await listLeagues()).length + 1}`;
  const createdAt = new Date().toISOString();
  const generated = generateWorld({
    config,
    seed: input.seed.trim() || newSeed(),
    name,
    userCid: input.userCid,
    createdAt,
  });
  // The user's tactic starts as the AI's pick; from then on only he changes it.
  const { date } = generated.meta.game;
  const world = {
    ...generated,
    clubs: generated.clubs.map((c) =>
      c.cid === input.userCid ? withAutoLineup(c, generated.players, date, config.competitions) : c,
    ),
  };

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
    const cache = await openCache(db);
    ensureSeason({ lid: league.lid, db, cache, config });
    await cache.flush();
    db.close();
  } catch (error) {
    await unregisterLeague(league.lid);
    await deleteLeagueDb(league.lid).catch(() => undefined);
    throw error;
  }
  return league;
}

export async function deleteLeague(lid: number): Promise<void> {
  if (claimed === lid) claimed = null;
  if (currentLid === lid) await closeLeague();
  await deleteLeagueDb(lid);
  await unregisterLeague(lid);
}

/**
 * A tab opens a league on purpose (its pages, or "Open this league here"): it becomes the
 * one open. Calls from tabs still showing another league are refused (assertClaimed) rather
 * than switching back, or two tabs would take turns forever.
 */
export async function claimLeague(lid: number): Promise<void> {
  claimed = lid;
  await openLeague(lid);
}

/** Fails for a league other than the one a tab last opened on purpose. */
export function assertClaimed(lid: number): void {
  if (claimed !== null && claimed !== lid) throw new GameError(LEAGUE_CLOSED);
}

/** Opens a league (loading its current data into memory), closing any other. */
export function openLeague(lid: number): Promise<LeagueSession> {
  if (current && currentLid === lid) return current;
  const previous = current;
  currentLid = lid;
  current = (async () => {
    if (previous) await close(previous);
    if (!(await listLeagues()).some((l) => l.lid === lid)) {
      throw new GameError(`There's no league ${lid} in this browser. It may have been deleted.`);
    }
    const db = await openLeagueDb(lid);
    const session: LeagueSession = { lid, db, cache: await openCache(db), config: worlds.classic };
    ensureSeason(session); // saves from before M3 get their season set up here
    openedListener?.(lid);
    return session;
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
  // An action under way (a Play started in another tab) finishes and is saved first.
  await whenIdle(open);
  open.closed = true;
  await open.cache.flush();
  open.db.close();
}
