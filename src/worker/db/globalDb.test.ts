import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { beforeAll, describe, expect, it } from "vitest";
import { listLeagues } from "./globalDb";

beforeAll(async () => {
  globalThis.indexedDB = new IDBFactory();
  // What an M0 build left behind: global DB v1 with the plumbing demo, and its league DB.
  const global = await openDB("soccer-sim-game", 1, {
    upgrade(db) {
      db.createObjectStore("leagues", { keyPath: "lid" });
    },
  });
  await global.put("leagues", {
    lid: 1,
    name: "M0 plumbing demo",
    createdAt: "2026-10-14T00:00:00.000Z",
    lastPlayedAt: "2026-10-14T00:00:00.000Z",
  });
  global.close();
  const league = await openDB("league-1", 1, {
    upgrade(db) {
      db.createObjectStore("meta");
    },
  });
  await league.put("meta", 4, "demoCounter");
  league.close();
});

describe("upgrading from an M0 build", () => {
  it("removes the M0 plumbing demo save and its database", async () => {
    expect(await listLeagues()).toEqual([]);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).toContain("soccer-sim-game");
    expect(names).not.toContain("league-1");
  });
});
