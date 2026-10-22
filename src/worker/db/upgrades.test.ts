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

describe("league DB v3 upgrade", () => {
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
      devTally: { minutes: 180, appearances: 2, ratingTotal: 15.2, seasonMinutes: 180 },
    } as unknown as Player);
    await v2.put("players", { pid: 3 } as unknown as Player);
    await v2.put(
      "meta",
      { fid: 2, state: { teams: [{ all: [{ stats: oldPlayer(4, "GK", 0, 1) }] }, { all: [] }] } },
      "live",
    );
    v2.close();

    const v3 = await openLeagueDb(9001);
    expect(v3.version).toBe(LEAGUE_DB_VERSION);
    const match = await v3.get("matches", 1);
    expect(match?.result.players.map((p) => p.rating)).toEqual([6.9, 8]);
    // Keepers' post-shot xG wasn't recorded: filled in as neutral (= goals conceded).
    expect(match?.result.players.map((p) => p.psxgFaced)).toEqual([2, 0]);
    expect((await v3.get("playerStats", [2, 2026, 0, "ENG1"]))?.ratingTotal).toBe(13.8);
    expect((await v3.get("players", 2))?.devTally?.ratingTotal).toBe(16);
    expect(await v3.get("players", 3)).toEqual({ pid: 3 });
    const live = (await v3.get("meta", "live")) as {
      state: { teams: { all: { stats: { psxgFaced: number } }[] }[] };
    };
    expect(live.state.teams[0]?.all[0]?.stats.psxgFaced).toBe(1);
    v3.close();

    // Opening it again changes nothing.
    const again = await openLeagueDb(9001);
    expect((await again.get("matches", 1))?.result.players.map((p) => p.rating)).toEqual([6.9, 8]);
    again.close();
  });

  it("creates a new save at v3 with nothing to convert", async () => {
    const db = await openLeagueDb(9002);
    expect(db.version).toBe(LEAGUE_DB_VERSION);
    expect(await db.count("matches")).toBe(0);
    db.close();
  });
});
