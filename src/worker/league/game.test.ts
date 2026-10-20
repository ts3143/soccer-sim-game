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
import { operatingRevenue } from "../finance/finance";
import { openLeagueDb } from "../db/leagueDb";
import { getPlayer } from "../views/players";
import {
  acceptJobOffer,
  gameState,
  play,
  prunedName,
  pruneMatchRecords,
  pruneRetiredPlayers,
} from "./game";
import { contractTalks, renewContract } from "./market";
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
      "watchNextMatch",
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
    // Money: gates, TV (equal and merit), commercial, wages and dials are booked.
    for (const row of eng1) {
      for (const kind of ["matchday", "broadcast", "merit", "commercial"]) {
        expect(row.revenue[kind] ?? 0).toBeGreaterThan(0);
      }
      expect(row.expenses.wages ?? 0).toBeGreaterThan(0);
    }
    // The season's awards are saved at the final whistle.
    const awardRows = await openLeague(1).then((s) => s.cache.getAll("awards"));
    expect(awardRows.filter((a) => a.type === "champions")).toHaveLength(3);
    expect(awardRows.filter((a) => a.type === "teamOfTheSeason")).toHaveLength(33);
    // Condition and injuries are saved with the players.
    const { db } = await openLeague(1);
    const players = await db.getAll("players");
    expect(players.filter((p) => p.conditionDate).length).toBeGreaterThan(600);
    expect(players.some((p) => p.injury !== null)).toBe(true);
    // The user hears about his final-year contracts in January and before deadline day.
    const subjects = (await db.getAll("inbox")).map((m) => m.subject);
    expect(subjects.some((x) => /contract\(s\) end in June/.test(x))).toBe(true);
    expect(subjects.some((x) => /^Deadline day tomorrow/.test(x))).toBe(true);
    const log = await db.getAllFromIndex("transactions", "season", 2026);
    expect(log.filter((t) => t.type === "renewal").length).toBeGreaterThan(50);
    // The AI's market: transfers between AI clubs, and bids for the user's players.
    expect(log.filter((t) => t.type === "transfer").length).toBeGreaterThan(50);
    const bids = await db.getAll("offers");
    expect(bids.every((o) => o.toCid === 0 && o.status === "expired")).toBe(true);
  });

  it("gives the same season when stopped, reloaded and continued", SLOW, async () => {
    const league = await createLeague({ name: "Stop-start", seed: SEED, userCid: 0 });
    let session = await openLeague(league.lid);
    const week = await play(session, "oneWeek");
    expect(week).toMatchObject({ from: "2026-07-01", to: "2026-07-08", matchesPlayed: 0 });
    // While it runs, every tab sees which Play action is under way.
    let during: string | null = null;
    const toFirst = await play(session, "untilNextMatch", () => {
      during = gameState(session).playing;
    });
    expect(during).toBe("untilNextMatch");
    expect(gameState(session).playing).toBeNull();
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
    const userCid = (session.cache.get("meta", "game") as GameMeta).userCid;
    const leaving = session.cache
      .getAll("players")
      .filter(
        (p) => p.cid === userCid && p.status === "club" && p.contract?.expires === "2027-06-30",
      );
    expect(leaving.length).toBeGreaterThan(0);
    const next = await play(session, "advanceToPreseason");
    // Contracts that ended on 30 June expired on 1 July (no more M3 rollover).
    for (const p of leaving) {
      expect(session.cache.get("players", p.pid)?.status).toMatch(/freeAgent|retired/);
    }
    expect(
      session.cache
        .getAll("inbox")
        .some((m) => /left at the end of their contracts/.test(m.subject)),
    ).toBe(true);
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
    // Last season closed with a cash snapshot; the new one is budgeted on its revenue.
    const closed = session.cache.getAll("clubSeasons").filter((c) => c.season === 2026);
    expect(closed.every((c) => c.cashEnd === session.cache.get("clubs", c.cid)?.cash)).toBe(true);
    // The FFP check ran for every club on 30 June.
    expect(closed.every((c) => c.squadCostRatio !== null && c.squadCostRatio > 0.2)).toBe(true);
    expect(closed.some((c) => (c.amortisation ?? 0) > 0)).toBe(true);
    // The new season's tables start empty, in the clubs' new leagues.
    const rows = session.cache.getAll("clubSeasons").filter((c) => c.season === 2027);
    for (const row of rows) {
      const last = closed.find((c) => c.cid === row.cid);
      const revenue = operatingRevenue(last?.revenue ?? {});
      expect(row.budgetBase).toBe(revenue);
    }
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
    // His name stays, for old box scores, and his profile says what happened.
    const name = `${ordinary.firstName} ${ordinary.lastName}`.trim();
    expect(prunedName(session, ordinary.pid)).toEqual({ name, retired: 2020 });
    await expect(getPlayer(1, ordinary.pid)).rejects.toThrow(
      `${name} retired in 2020 and is no longer in the save.`,
    );
    await expect(getPlayer(1, 9_999_999)).rejects.toThrow(/no player 9999999/);
  });

  it(
    "sacks the user when board confidence collapses, then he takes a job offer",
    SLOW,
    async () => {
      const league = await createLeague({ name: "Sacked", seed: "sacked-test", userCid: 0 });
      const session = await openLeague(league.lid);
      const inbox = session.cache.getAll("inbox");
      expect(inbox.some((m) => /The board's target/.test(m.subject))).toBe(true);
      // A title target, an empty board and a bankrupt club: the board loses patience.
      const row = session.cache.get("clubSeasons", [0, 2026]) as ClubSeason;
      session.cache.put("clubSeasons", {
        ...row,
        boardExpectation: "title",
        boardStart: 0,
        boardConfidence: 0,
      });
      const club = session.cache.get("clubs", 0);
      if (club) session.cache.put("clubs", { ...club, cash: -10 * club.revenueAnchor });
      const report = await play(session, "untilEndOfSeason");
      expect(report.phase).toBe("regularSeason"); // stopped on the day he was sacked
      const state = gameState(session);
      expect(state.fired?.offers.length).toBeGreaterThan(0);
      expect(state.options).toEqual([]);
      await expect(play(session, "oneWeek")).rejects.toThrow(/isn't possible now/);
      const offer = state.fired?.offers[0]?.cid as number;
      await acceptJobOffer(session, offer);
      const after = gameState(session);
      expect(after.fired).toBeNull();
      expect(after.options).toContain("untilNextMatch");
      expect((session.cache.get("meta", "game") as GameMeta).userCid).toBe(offer);
      const subjects = session.cache.getAll("inbox").map((m) => m.subject);
      expect(subjects).toContain("You have been sacked");
      expect(subjects.some((x) => x.startsWith("Welcome to"))).toBe(true);
    },
  );

  it("renews the user's players at their asks, only in a window", SLOW, async () => {
    const league = await createLeague({ name: "Renewals", seed: SEED, userCid: 0 });
    const session = await openLeague(league.lid);
    const mine = session.cache
      .getAll("players")
      .filter((p) => p.cid === 0 && p.status === "club")
      .sort((a, b) => (a.contract?.expires ?? "").localeCompare(b.contract?.expires ?? ""));
    const p = mine[0] as (typeof mine)[number];
    const talks = contractTalks(session, p.pid);
    expect(talks).toMatchObject({ userPlayer: true, windowOpen: true, yearsLeft: 1 });
    expect(talks.asks).toHaveLength(5);
    expect(talks.value).toBeGreaterThan(0);
    await renewContract(session, p.pid, 2);
    const renewed = session.cache.get("players", p.pid);
    const two = talks.asks.find((a) => a.years === 2);
    expect(two?.expires).toBe("2028-06-30");
    expect(renewed?.contract).toEqual({ wage: two?.wage, expires: "2028-06-30" });
    expect(session.cache.getAll("transactions").at(-1)).toMatchObject({
      type: "renewal",
      pids: [p.pid],
    });
    // Not another club's player, not a renewal that doesn't extend, not outside a window.
    const theirs = session.cache.getAll("players").find((x) => x.cid === 1 && x.status === "club");
    await expect(renewContract(session, theirs?.pid ?? -1, 2)).rejects.toThrow(/your own/);
    await expect(renewContract(session, p.pid, 1)).rejects.toThrow(/must run past the current one/);
    await play(session, "untilWindowCloses");
    await play(session, "oneWeek");
    expect(contractTalks(session, p.pid).windowOpen).toBe(false);
    await expect(renewContract(session, p.pid, 3)).rejects.toThrow(/transfer window/);
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
