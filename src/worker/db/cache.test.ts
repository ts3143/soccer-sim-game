import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { openDB, type DBSchema } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { Cache } from "./cache";
import { createLeague, listLeagues } from "./globalDb";
import { openLeagueDb } from "./leagueDb";

/** A meta-style store (out-of-line keys) plus a players-style store (key path), as M1 will have. */
interface TestSchema extends DBSchema {
  meta: { key: string; value: unknown };
  players: { key: number; value: { pid: number; name: string } };
}

const openTestDb = () =>
  openDB<TestSchema>("cache-test", 1, {
    upgrade(db) {
      db.createObjectStore("meta");
      db.createObjectStore("players", { keyPath: "pid" });
    },
  });

/** Simulates a page reload: close the database and load a fresh cache from it. */
async function reload(cache: Cache<TestSchema>): Promise<Cache<TestSchema>> {
  cache.db.close();
  return Cache.open(await openTestDb(), ["meta", "players"]);
}

beforeEach(() => {
  // A brand-new, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

describe("Cache", () => {
  it("serves writes from memory before any flush", async () => {
    const cache = await Cache.open(await openTestDb(), ["meta", "players"]);
    cache.put("meta", 7, "counter");
    expect(cache.get("meta", "counter")).toBe(7);
    expect(cache.hasUnsavedChanges).toBe(true);
  });

  it("persists flushed rows across a reload, for both key styles", async () => {
    let cache = await Cache.open(await openTestDb(), ["meta", "players"]);
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
    let cache = await Cache.open(await openTestDb(), ["meta", "players"]);
    cache.put("meta", 1, "counter");
    cache = await reload(cache);
    expect(cache.get("meta", "counter")).toBeUndefined();
  });

  it("persists deletes", async () => {
    let cache = await Cache.open(await openTestDb(), ["meta", "players"]);
    cache.put("players", { pid: 1, name: "A" });
    await cache.flush();
    cache.delete("players", 1);
    await cache.flush();
    cache = await reload(cache);
    expect(cache.getAll("players")).toEqual([]);
  });

  it("keeps writes made during a flush for the next flush", async () => {
    let cache = await Cache.open(await openTestDb(), ["meta", "players"]);
    cache.put("meta", 1, "counter");
    const flushing = cache.flush();
    cache.put("meta", 2, "counter");
    await flushing;
    expect(cache.hasUnsavedChanges).toBe(true);
    await cache.flush();
    cache = await reload(cache);
    expect(cache.get("meta", "counter")).toBe(2);
  });

  it("requires a key for stores without a key path", async () => {
    const cache = await Cache.open(await openTestDb(), ["meta"]);
    expect(() => cache.put("meta", 1)).toThrow(/pass a key/);
    expect(() => cache.getAll("players")).toThrow(/not cached/);
  });
});

describe("league databases", () => {
  it("registers leagues with increasing integer IDs", async () => {
    const now = "2026-10-14T12:00:00.000Z";
    expect((await createLeague("First", now)).lid).toBe(1);
    expect((await createLeague("Second", now)).lid).toBe(2);
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
