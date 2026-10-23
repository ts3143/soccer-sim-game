import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { MatchRecord, Player, PlayerStatsRow } from "../../common/schema";
import { openLeagueDb } from "./leagueDb";
import { LEAGUE_DB_VERSION } from "./schema";

const oldPlayer = (pid: number, position: string, rating: number, goalsConceded = 0) => ({
  pid,
  position,
  rating,
  goalsConceded,
  minutes: 90,
});

describe("league DB upgrades", () => {
  it("moves an older save's ratings to the 6.9 scale, once", async () => {
    const v2 = await openLeagueDb(9001, 2);
    await v2.put("matches", {
      fid: 1,
      season: 2026,
      result: { players: [oldPlayer(1, "GK", 6.6, 2), oldPlayer(2, "ST", 7.6)] },
    } as unknown as MatchRecord);
    await v2.put("playerStats", {
      pid: 2,
      season: 2026,
      cid: 0,
      competition: "ENG1",
      appearances: 2,
      ratingTotal: 13.2,
    } as unknown as PlayerStatsRow);
    await v2.put("players", {
      pid: 2,
      position: "ST",
      devTally: { minutes: 180, appearances: 2, ratingTotal: 15.2, seasonMinutes: 180 },
    } as unknown as Player);
    await v2.put("players", { pid: 3, position: "CB" } as unknown as Player);
    await v2.put("players", { pid: 1, position: "GK" } as unknown as Player);
    await v2.put("playerStats", {
      pid: 1,
      season: 2026,
      cid: 0,
      competition: "ENG1",
      appearances: 2,
      ratingTotal: 13.2,
    } as unknown as PlayerStatsRow);
    await v2.put(
      "meta",
      { fid: 2, state: { teams: [{ all: [{ stats: oldPlayer(4, "GK", 0, 1) }] }, { all: [] }] } },
      "live",
    );
    v2.close();

    const v3 = await openLeagueDb(9001);
    expect(v3.version).toBe(LEAGUE_DB_VERSION);
    const match = await v3.get("matches", 1);
    expect(match?.result.players.map((p) => p.rating)).toEqual([6.8, 8]);
    // Keepers' post-shot xG wasn't recorded: filled in as neutral (= goals conceded).
    expect(match?.result.players.map((p) => p.psxgFaced)).toEqual([2, 0]);
    expect((await v3.get("playerStats", [2, 2026, 0, "ENG1"]))?.ratingTotal).toBe(13.8);
    // Keepers' totals move to their own centre (6.8).
    expect((await v3.get("playerStats", [1, 2026, 0, "ENG1"]))?.ratingTotal).toBe(13.6);
    expect((await v3.get("players", 2))?.devTally?.ratingTotal).toBe(16);
    expect(await v3.get("players", 3)).toEqual({ pid: 3, position: "CB" });
    const live = (await v3.get("meta", "live")) as {
      state: { teams: { all: { stats: { psxgFaced: number } }[] }[] };
    };
    expect(live.state.teams[0]?.all[0]?.stats.psxgFaced).toBe(1);
    v3.close();

    // Opening it again changes nothing.
    const again = await openLeagueDb(9001);
    expect((await again.get("matches", 1))?.result.players.map((p) => p.rating)).toEqual([6.8, 8]);
    again.close();
  });

  it("names the man of the match in an older save's records and counts the awards", async () => {
    const v3 = await openLeagueDb(9003, 3);
    const line = (pid: number, side: 0 | 1, rating: number, goals = 0) => ({
      pid,
      side,
      rating,
      goals,
      assists: 0,
      minutes: 90,
    });
    const match = (fid: number, homeGoals: number, awayGoals: number, players: object[]) =>
      ({
        fid,
        season: 2026,
        competition: "ENG1",
        homeCid: 5,
        awayCid: 7,
        result: { homeGoals, awayGoals, winner: null, players },
      }) as unknown as MatchRecord;
    // A clear best; then a tie on 8.1, which goes to the winning (away) side.
    await v3.put("matches", match(1, 2, 0, [line(10, 0, 8.4, 2), line(20, 1, 6.5)]));
    await v3.put("matches", match(2, 0, 1, [line(10, 0, 8.1), line(20, 1, 8.1)]));
    await v3.put("matches", match(3, 1, 0, [line(10, 0, 7.9), line(20, 1, 7.2)]));
    const stats = (pid: number, cid: number) =>
      ({
        pid,
        season: 2026,
        cid,
        competition: "ENG1",
        appearances: 3,
      }) as unknown as PlayerStatsRow;
    await v3.put("playerStats", stats(10, 5));
    await v3.put("playerStats", stats(20, 7));
    await v3.put("playerStats", stats(30, 7));
    v3.close();

    const v4 = await openLeagueDb(9003);
    expect(v4.version).toBe(LEAGUE_DB_VERSION);
    expect(
      await Promise.all([1, 2, 3].map(async (fid) => (await v4.get("matches", fid))?.result.motm)),
    ).toEqual([10, 20, 10]);
    expect((await v4.get("playerStats", [10, 2026, 5, "ENG1"]))?.motm).toBe(2);
    expect((await v4.get("playerStats", [20, 2026, 7, "ENG1"]))?.motm).toBe(1);
    expect((await v4.get("playerStats", [30, 2026, 7, "ENG1"]))?.motm).toBe(0);
    v4.close();

    // Opening it again changes nothing.
    const again = await openLeagueDb(9003);
    expect((await again.get("playerStats", [10, 2026, 5, "ENG1"]))?.motm).toBe(2);
    again.close();
  });

  it("creates a new save at the current version with nothing to convert", async () => {
    const db = await openLeagueDb(9002);
    expect(db.version).toBe(LEAGUE_DB_VERSION);
    expect(await db.count("matches")).toBe(0);
    db.close();
  });
});
