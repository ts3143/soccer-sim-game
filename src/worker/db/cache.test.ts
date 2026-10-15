import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { openDB, type DBSchema } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { Cache } from "./cache";
import { listLeagues, registerLeague } from "./globalDb";
import { openLeagueDb } from "./leagueDb";

/** The three key styles a league save uses: out-of-line, key path, compound key path. */
interface TestSchema extends DBSchema {
  meta: { key: string; value: unknown };
  players: { key: number; value: { pid: number; name: string } };
  clubSeasons: {
    key: [number, number];
    value: { cid: number; season: number; points: number };
    indexes: { season: number };
  };
}

const openTestDb = () =>
  openDB<TestSchema>("cache-test", 1, {
    upgrade(db) {
      db.createObjectStore("meta");
      db.createObjectStore("players", { keyPath: "pid" });
      db.createObjectStore("clubSeasons", { keyPath: ["cid", "season"] }).createIndex(
        "season",
        "season",
      );
    },
  });

const ALL = ["meta", "players", "clubSeasons"] as const;

/** Simulates a page reload: close the database and load a fresh cache from it. */
async function reload(cache: Cache<TestSchema>): Promise<Cache<TestSchema>> {
  cache.db.close();
  return Cache.open(await openTestDb(), ALL);
}

beforeEach(() => {
  // A brand-new, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

describe("Cache", () => {
  it("loads one season of a store by index, and evicts saved rows only", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    for (const season of [1, 2]) {
      for (const cid of [10, 11, 12]) cache.put("clubSeasons", { cid, season, points: season });
    }
    await cache.flush();
    cache.db.close();
    cache = await Cache.open(await openTestDb(), ALL, {
      clubSeasons: { index: "season", value: 2 },
    });
    expect(cache.getAll("clubSeasons").map((r) => r.cid)).toEqual([10, 11, 12]);
    expect(cache.get("clubSeasons", [11, 2])?.points).toBe(2);
    expect(cache.get("clubSeasons", [11, 1])).toBeUndefined();

    cache.put("clubSeasons", { cid: 10, season: 3, points: 0 });
    expect(() => cache.evict("clubSeasons", (r) => r.season === 3)).toThrow(/flush/);
    await cache.flush();
    expect(cache.evict("clubSeasons", (r) => r.season === 2)).toBe(3);
    expect(cache.getAll("clubSeasons")).toEqual([{ cid: 10, season: 3, points: 0 }]);
    expect(await cache.db.count("clubSeasons")).toBe(7); // evicted rows stay saved
  });

  it("serves writes from memory before any flush", async () => {
    const cache = await Cache.open(await openTestDb(), ALL);
    cache.put("meta", 7, "counter");
    expect(cache.get("meta", "counter")).toBe(7);
    expect(cache.hasUnsavedChanges).toBe(true);
  });

  it("persists flushed rows across a reload, for both key styles", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    cache.put("meta", { season: 2026 }, "game");
    cache.put("players", { pid: 1, name: "A" });
    cache.put("players", { pid: 2, name: "B" });
    await cache.flush();
    expect(cache.hasUnsavedChanges).toBe(false);

    cache = await reload(cache);
    expect(cache.get("meta", "game")).toEqual({ season: 2026 });
    expect(cache.getAll("players").map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("does not persist unflushed changes", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    cache.put("meta", 1, "counter");
    cache = await reload(cache);
    expect(cache.get("meta", "counter")).toBeUndefined();
  });

  it("persists deletes", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    cache.put("players", { pid: 1, name: "A" });
    await cache.flush();
    cache.delete("players", 1);
    await cache.flush();
    cache = await reload(cache);
    expect(cache.getAll("players")).toEqual([]);
  });

  it("keeps writes made during a flush for the next flush", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    cache.put("meta", 1, "counter");
    const flushing = cache.flush();
    cache.put("meta", 2, "counter");
    await flushing;
    expect(cache.hasUnsavedChanges).toBe(true);
    await cache.flush();
    cache = await reload(cache);
    expect(cache.get("meta", "counter")).toBe(2);
  });

  it("handles compound keys like a club-season's [cid, season]", async () => {
    let cache = await Cache.open(await openTestDb(), ALL);
    cache.put("clubSeasons", { cid: 3, season: 2026, points: 0 });
    cache.put("clubSeasons", { cid: 3, season: 2027, points: 5 });
    cache.put("clubSeasons", { cid: 3, season: 2026, points: 12 });
    await cache.flush();
    cache = await reload(cache);
    expect(cache.get("clubSeasons", [3, 2026])?.points).toBe(12);
    expect(cache.getAll("clubSeasons")).toHaveLength(2);
    cache.delete("clubSeasons", [3, 2027]);
    await cache.flush();
    cache = await reload(cache);
    expect(cache.get("clubSeasons", [3, 2027])).toBeUndefined();
  });

  it("requires a key for stores without a key path", async () => {
    const cache = await Cache.open(await openTestDb(), ["meta"]);
    expect(() => cache.put("meta", 1)).toThrow(/pass a key/);
    expect(() => cache.getAll("players")).toThrow(/not cached/);
  });
});

describe("league databases", () => {
  it("registers leagues with increasing integer IDs", async () => {
    const entry = (name: string) => ({
      name,
      createdAt: "2026-10-14T12:00:00.000Z",
      lastPlayedAt: "2026-10-14T12:00:00.000Z",
      clubName: "Islington Cannons",
      season: 2026,
    });
    expect((await registerLeague(entry("First"))).lid).toBe(1);
    expect((await registerLeague(entry("Second"))).lid).toBe(2);
    expect((await listLeagues()).map((l) => l.name)).toEqual(["First", "Second"]);
  });

  it("opens a league database with a meta store that the cache can use", async () => {
    const db = await openLeagueDb(1);
    const cache = await Cache.open(db, ["meta"]);
    cache.put("meta", 3, "demoCounter");
    await cache.flush();
    db.close();
    const reopened = await Cache.open(await openLeagueDb(1), ["meta"]);
    expect(reopened.get("meta", "demoCounter")).toBe(3);
  });
});
