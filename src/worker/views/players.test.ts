import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import { getPlayer, getTeamSquad } from "./players";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("squad and player pages", () => {
  it("list a club's players and show one player's profile", { timeout: 120_000 }, async () => {
    const league = await createLeague({ name: "Players", seed: "players-view", userCid: 3 });
    const squad = await getTeamSquad(league.lid, 3);
    expect(squad.players.length).toBeGreaterThanOrEqual(20);
    expect(squad.academy.length).toBeGreaterThan(5);
    expect(squad.strength).toBeGreaterThan(55);
    expect(squad.players[0]?.position).toBe("GK"); // in position order
    expect(squad.players.every((p) => p.value > 0 && p.mood !== null && p.condition === 100)).toBe(
      true,
    );
    expect(squad.players.some((p) => p.expiring)).toBe(true);

    const session = await openLeague(league.lid);
    await play(session, "untilNextMatch");
    const after = await getTeamSquad(league.lid, 3);
    expect(after.players.some((p) => p.season.appearances === 1 && p.season.rating !== null)).toBe(
      true,
    );

    const star = [...after.players].sort((a, b) => b.ovr - a.ovr)[0];
    const profile = await getPlayer(league.lid, star?.pid ?? -1);
    expect(profile).toMatchObject({
      pid: star?.pid,
      ovr: star?.ovr,
      status: "club",
      team: { cid: 3 },
    });
    expect(profile.ratings).toHaveLength(22);
    expect(new Set(profile.ratings.map((r) => r.group)).size).toBeGreaterThan(3);
    expect(profile.positionOvrs).toHaveLength(10);
    expect(profile.contract?.wage).toBeGreaterThan(0);
    expect(Object.keys(profile.mood?.components ?? {})).toContain("playingTime");
    expect(profile.transfers.length).toBeGreaterThanOrEqual(0);
    const free = session.cache.getAll("players").find((p) => p.status === "freeAgent");
    const freeProfile = await getPlayer(league.lid, free?.pid ?? -1);
    expect(freeProfile).toMatchObject({
      status: "freeAgent",
      team: null,
      contract: null,
      mood: null,
    });
  });
});
