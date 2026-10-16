import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ClubSeason,
  Fixture,
  GameMeta,
  PlayerStatsRow,
  SeasonMeta,
} from "../../common/schema";
import { listLeagues } from "../db/globalDb";
import { openLeagueDb } from "../db/leagueDb";
import { gameState, play, pruneMatchRecords, pruneRetiredPlayers } from "./game";
import { closeLeague, createLeague, openLeague } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Whole seasons with every result saved: several seconds locally, more on CI.
// fake-indexeddb rewrites rows in O(store size) per write (real browsers don't), so the
// stop-start test reloads once, early, rather than saving after many small steps.
const SLOW = { timeout: 180_000 };
const SEED = "game-loop-test";

/** Everything a season leaves in the save, read back from IndexedDB. */
async function savedSeason(lid: number, season: number) {
  await closeLeague();
  const { db } = await openLeague(lid);
  const fixtures = await db.getAllFromIndex("fixtures", "season", season);
  const stats = await db.getAllFromIndex("playerStats", "season", season);
  const clubSeasons = await db.getAllFromIndex("clubSeasons", "season", season);
  const matches = await db.countFromIndex("matches", "season", season);
  return { fixtures, stats, clubSeasons, matches };
}

let straight: Awaited<ReturnType<typeof savedSeason>>;

describe("the season loop in a save", () => {
  it("sets up a new league's first season in preseason", SLOW, async () => {
    const league = await createLeague({ name: "Straight", seed: SEED, userCid: 0 });
    const session = await openLeague(league.lid);
    const state = gameState(session);
    expect(state).toMatchObject({ season: 2026, phase: "preseason", date: "2026-07-01" });
    expect(state.window).toEqual({ id: "summer", closes: "2026-08-31" });
    expect(state.options).toEqual([
      "untilNextMatch",
      "oneWeek",
      "untilWindowCloses",
      "untilEndOfSeason",
    ]);
    // League fixtures plus the first round of both cups.
    expect(session.cache.getAll("fixtures")).toHaveLength(380 + 552 + 306 + 12 + 2);
    expect(state.nextUserFixture?.date).toBe("2026-08-15");
  });

  it("plays to the end of the season in one go and saves every result", SLOW, async () => {
    const session = await openLeague(1);
    const report = await play(session, "untilEndOfSeason");
    expect(report.phase).toBe("endOfSeason");
    expect(gameState(session).options).toEqual(["proceedToPromotionRelegation"]);
    straight = await savedSeason(1, 2026);
    expect(straight.fixtures.every((f) => f.result !== null)).toBe(true);
    expect(straight.matches).toBe(straight.fixtures.length);

    // Player goals add up to the fixtures' goals in every competition (no own goals).
    const goals = new Map<string, number>();
    for (const f of straight.fixtures) {
      const r = f.result as NonNullable<Fixture["result"]>;
      goals.set(f.competition, (goals.get(f.competition) ?? 0) + r.homeGoals + r.awayGoals);
    }
    const scored = new Map<string, number>();
    for (const row of straight.stats) {
      scored.set(row.competition, (scored.get(row.competition) ?? 0) + row.goals);
    }
    expect(scored).toEqual(goals);
    // Every league match has at least 11 players per side; club-season rows hold the table.
    const appearances = straight.stats
      .filter((r) => r.competition === "ENG1")
      .reduce((sum, r) => sum + r.appearances, 0);
    expect(appearances).toBeGreaterThanOrEqual(380 * 22);
    const eng1 = straight.clubSeasons.filter((c) => c.leagueId === "ENG1");
    expect(eng1.map((c) => c.finish).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(eng1.every((c) => c.won + c.drawn + c.lost === 38)).toBe(true);
    // The season's awards are saved at the final whistle.
    const awardRows = await openLeague(1).then((s) => s.cache.getAll("awards"));
    expect(awardRows.filter((a) => a.type === "champions")).toHaveLength(3);
    expect(awardRows.filter((a) => a.type === "teamOfTheSeason")).toHaveLength(33);
    // Condition and injuries are saved with the players.
    const { db } = await openLeague(1);
    const players = await db.getAll("players");
    expect(players.filter((p) => p.conditionDate).length).toBeGreaterThan(600);
    expect(players.some((p) => p.injury !== null)).toBe(true);
  });

  it("gives the same season when stopped, reloaded and continued", SLOW, async () => {
    const league = await createLeague({ name: "Stop-start", seed: SEED, userCid: 0 });
    let session = await openLeague(league.lid);
    const week = await play(session, "oneWeek");
    expect(week).toMatchObject({ from: "2026-07-01", to: "2026-07-08", matchesPlayed: 0 });
    const toFirst = await play(session, "untilNextMatch");
    expect(toFirst.to).toBe("2026-08-15");
    expect(gameState(session).phase).toBe("regularSeason");
    expect(toFirst.matchesPlayed).toBeGreaterThan(10); // ENG2 and the cup started earlier
    expect((await play(session, "untilWindowCloses")).to).toBe("2026-08-31");

    await closeLeague(); // like closing the tab: everything is read back from IndexedDB
    session = await openLeague(league.lid);
    expect((session.cache.get("meta", "game") as GameMeta).date).toBe("2026-08-31");
    await play(session, "untilNextMatch");
    await play(session, "untilEndOfSeason");
    const resumed = await savedSeason(league.lid, 2026);

    expect(resumed.fixtures).toEqual(straight.fixtures);
    const byKey = (rows: PlayerStatsRow[]) =>
      [...rows].sort(
        (a, b) => a.pid - b.pid || a.competition.localeCompare(b.competition) || a.cid - b.cid,
      );
    expect(byKey(resumed.stats)).toEqual(byKey(straight.stats));
    const byCid = (rows: ClubSeason[]) => [...rows].sort((a, b) => a.cid - b.cid);
    expect(byCid(resumed.clubSeasons)).toEqual(byCid(straight.clubSeasons));
  });

  it("applies promotion and relegation, then starts the next season", SLOW, async () => {
    let session = await openLeague(1);
    const before = new Map(session.cache.getAll("clubs").map((c) => [c.cid, c.leagueId]));
    const eng1Table = session.cache
      .getAll("clubSeasons")
      .filter((c) => c.season === 2026 && c.leagueId === "ENG1")
      .sort((a, b) => (a.finish ?? 0) - (b.finish ?? 0));

    const moves = await play(session, "proceedToPromotionRelegation");
    expect(moves.to).toBe("2027-06-01");
    const retirements = session.cache.getAll("transactions").filter((t) => t.type === "retirement");
    expect(retirements.length).toBeGreaterThan(30);
    expect(gameState(session).options).toEqual(["advanceToPreseason"]);
    for (const row of eng1Table.slice(-3)) {
      expect(session.cache.get("clubs", row.cid)?.leagueId).toBe("ENG2");
    }

    const playersBefore = session.cache.getAll("players").length;
    const next = await play(session, "advanceToPreseason");
    expect(next).toMatchObject({ to: "2027-07-01", phase: "preseason" });
    // Summer development, youth intake and academy decisions reached the save.
    const all = session.cache.getAll("players");
    expect(all.length).toBeGreaterThan(playersBefore + 180);
    const active = all.filter((p) => p.status !== "retired");
    expect(
      active.every(
        (p) => p.ratingsHistory.at(-1)?.date === "2027-07-01" || p.ratingsHistory.length === 1,
      ),
    ).toBe(true);
    expect(active.filter((p) => p.ratingsHistory.length === 3).length).toBeGreaterThan(1500);
    const types = new Set(session.cache.getAll("transactions").map((t) => t.type));
    expect(types.has("academyPromotion") || types.has("release")).toBe(true);
    expect(gameState(session)).toMatchObject({ season: 2027, phase: "preseason" });
    expect((session.cache.get("meta", "season") as SeasonMeta).movesApplied).toBe(false);
    // Only the new season's fixtures are in memory; last season's stay saved.
    const inMemory = session.cache.getAll("fixtures");
    expect(inMemory.every((f) => f.season === 2027)).toBe(true);
    expect(inMemory.length).toBe(380 + 552 + 306 + 12 + 2);
    expect(await session.db.countFromIndex("fixtures", "season", 2026)).toBe(
      straight.fixtures.length,
    );
    expect(session.cache.getAll("playerStats")).toEqual([]);
    // The new season's tables start empty, in the clubs' new leagues.
    const rows = session.cache.getAll("clubSeasons").filter((c) => c.season === 2027);
    expect(rows).toHaveLength(62);
    const moved = rows.filter((r) => r.leagueId !== before.get(r.cid));
    expect(moved).toHaveLength(6);
    expect((await listLeagues()).find((l) => l.lid === 1)?.season).toBe(2027);

    await closeLeague();
    session = await openLeague(1);
    expect(gameState(session).season).toBe(2027);
    expect(session.cache.getAll("fixtures").every((f) => f.season === 2027)).toBe(true);
  });

  it("keeps match records two seasons, and the user's club's forever", SLOW, async () => {
    const { db } = await openLeague(1);
    const userCid = ((await db.get("meta", "game")) as GameMeta).userCid;
    const all = await db.getAllFromIndex("matches", "season", 2026);
    const users = all.filter((m) => m.homeCid === userCid || m.awayCid === userCid).length;
    expect(await pruneMatchRecords(db, 2027, userCid)).toBe(0); // 2026 is last season: kept
    expect(await pruneMatchRecords(db, 2028, userCid)).toBe(all.length - users);
    expect(await db.countFromIndex("matches", "season", 2026)).toBe(users);
  });

  it("prunes long-retired players nobody will look up, with their stat rows", SLOW, async () => {
    const session = await openLeague(1);
    const retired = session.cache.getAll("players").filter((p) => p.status === "retired");
    const ordinary = retired.find((p) => Math.max(...p.ratingsHistory.map((r) => r.ovr)) < 70);
    const star = retired.find((p) => p !== ordinary);
    expect(ordinary && star).toBeTruthy();
    if (!ordinary || !star) return;
    for (const p of [ordinary, star]) session.cache.put("players", { ...p, retiredSeason: 2020 });
    session.cache.put("awards", {
      aid: 99_999,
      season: 2026,
      competition: "ENG1",
      type: "goldenBoot",
      pid: star.pid,
      cid: null,
      name: "x",
    });
    await session.cache.flush();
    const statRows = await session.db.countFromIndex("playerStats", "pid", ordinary.pid);
    expect(await pruneRetiredPlayers(session, 2027)).toBeGreaterThanOrEqual(1);
    expect(session.cache.get("players", ordinary.pid)).toBeUndefined();
    expect(await session.db.get("players", ordinary.pid)).toBeUndefined();
    expect(await session.db.countFromIndex("playerStats", "pid", ordinary.pid)).toBe(0);
    expect(statRows).toBeGreaterThanOrEqual(0);
    expect(session.cache.get("players", star.pid)).toBeDefined(); // has an award: kept
  });

  it("sets up the season for a save made before M3", SLOW, async () => {
    const league = await createLeague({ name: "Old save", seed: SEED, userCid: 0 });
    const session = await openLeague(league.lid);
    const expected = session.cache.getAll("fixtures").map((f) => ({ ...f, fid: 0 }));
    await closeLeague();
    // Remove what M3 adds, as an M2 save would look.
    const db = await openLeagueDb(league.lid);
    const tx = db.transaction(["meta", "fixtures"], "readwrite");
    await Promise.all([
      tx.objectStore("meta").delete("season"),
      tx.objectStore("fixtures").clear(),
      tx.done,
    ]);
    db.close();
    const reopened = await openLeague(league.lid);
    expect(reopened.cache.getAll("fixtures").map((f) => ({ ...f, fid: 0 }))).toEqual(expected);
    expect(gameState(reopened).phase).toBe("preseason");
  });
});
