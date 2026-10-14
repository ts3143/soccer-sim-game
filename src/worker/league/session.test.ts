import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { listLeagues } from "../db/globalDb";
import { getLeagueOverview, getSquad } from "../views/inspector";
import { closeLeague, createLeague, deleteLeague, openLeague } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Each test generates and saves a whole world: seconds locally, more on CI.
const SLOW = { timeout: 60_000 };

describe("league saves", () => {
  it("creates a full save that reopens with every acceptance check passing", SLOW, async () => {
    const league = await createLeague({ name: "Test league", seed: "session-test", userCid: 0 });
    expect(league).toMatchObject({ lid: 1, name: "Test league", season: 2026 });
    expect((await listLeagues()).map((l) => l.lid)).toEqual([1]);

    await closeLeague(); // like a reload: read everything back from IndexedDB
    const overview = await getLeagueOverview(league.lid);
    expect(overview.counts.clubs).toBe(62);
    expect(overview.checks.filter((c) => !c.pass)).toEqual([]);
    for (const club of overview.clubs) {
      expect(Math.abs(club.xiStrength - club.strengthTarget)).toBeLessThanOrEqual(1);
    }

    const { cache } = await openLeague(league.lid);
    const game = cache.get("meta", "game") as GameMeta;
    expect(game).toMatchObject({
      seed: "session-test",
      season: 2026,
      phase: "preseason",
      userCid: 0,
    });
    expect(cache.get("meta", "rng")).toBeTruthy();
  });

  it("serves a squad with the best XI first", SLOW, async () => {
    const squad = await getSquad(1, 0);
    expect(squad.players.slice(0, 11).every((p) => p.xiSlot !== null)).toBe(true);
    expect(squad.players.slice(11).every((p) => p.xiSlot === null)).toBe(true);
    expect(squad.players.some((p) => p.status === "academy")).toBe(true);
  });

  it("gives a random seed when none is entered, and deletes saves", SLOW, async () => {
    const second = await createLeague({ name: " ", seed: "", userCid: 5 });
    expect(second.lid).toBe(2);
    expect(second.name).toBe("League 2");
    const overview = await getLeagueOverview(2);
    expect(overview.seed).toMatch(/^[0-9a-f]{8}$/);
    await deleteLeague(2);
    expect((await listLeagues()).map((l) => l.lid)).toEqual([1]);
    await expect(getLeagueOverview(2)).rejects.toThrow("No league 2");
  });
});
