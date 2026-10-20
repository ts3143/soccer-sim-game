import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { listLeagues } from "../db/globalDb";
import { formationById } from "../../common/config/formations";
import { isSenior } from "../../common/status";
import { bestXi } from "../core/lineup";
import { evaluateWorld } from "../generate/checks";
import { getTeamSquad } from "../views/players";
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
    const { cache } = await openLeague(league.lid);
    const clubs = cache.getAll("clubs");
    const players = cache.getAll("players");
    const xiStrength = new Map(
      clubs.map((c) => [
        c.cid,
        bestXi(
          players.filter((p) => p.cid === c.cid && isSenior(p)),
          formationById(c.tactics.formation),
        ).meanOvr,
      ]),
    );
    expect(clubs).toHaveLength(62);
    const clubSeasons = cache.getAll("clubSeasons").filter((r) => r.season === 2026);
    expect(
      evaluateWorld({ clubs, clubSeasons, players, xiStrength }).filter((c) => !c.pass),
    ).toEqual([]);
    for (const club of clubs) {
      expect(Math.abs((xiStrength.get(club.cid) ?? 0) - club.strengthTarget)).toBeLessThanOrEqual(
        1,
      );
    }

    const game = cache.get("meta", "game") as GameMeta;
    expect(game).toMatchObject({
      seed: "session-test",
      season: 2026,
      phase: "preseason",
      userCid: 0,
    });
    expect(cache.get("meta", "rng")).toBeTruthy();
  });

  it("serves a club's squad and academy from the save", SLOW, async () => {
    const squad = await getTeamSquad(1, 0);
    expect(squad.players.length).toBeGreaterThanOrEqual(22);
    expect(squad.academy.length).toBeGreaterThan(0);
    expect(squad.strength).toBeGreaterThan(40);
  });

  it("gives a random seed when none is entered, and deletes saves", SLOW, async () => {
    const second = await createLeague({ name: " ", seed: "", userCid: 5 });
    expect(second.lid).toBe(2);
    expect(second.name).toBe("League 2");
    const game = (await openLeague(2)).cache.get("meta", "game") as GameMeta;
    expect(game.seed).toMatch(/^[0-9a-f]{8}$/);
    await deleteLeague(2);
    expect((await listLeagues()).map((l) => l.lid)).toEqual([1]);
    await expect(openLeague(2)).rejects.toThrow("No league 2");
  });
});
