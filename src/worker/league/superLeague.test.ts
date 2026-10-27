import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { playoffId } from "../season/season";
import { gameState, play } from "./game";
import { createLeague, openLeague } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// A whole season in a save: several seconds locally, more on CI.
const SLOW = { timeout: 180_000 };

describe("a Super League year in a save", () => {
  it("plays the season, crowns Star's play-off winner, moves 2 up and 2 down", SLOW, async () => {
    const league = await createLeague({
      world: "superLeague",
      name: "Year",
      seed: "super-league-year",
      userCid: 39, // Lyon Gones (Blue): a season his board judges mildly
    });
    const session = await openLeague(league.lid);
    const before = new Map(session.cache.getAll("clubs").map((c) => [c.cid, c.leagueId]));
    await play(session, "untilEndOfSeason");
    // Three draft classes have been there all season; prospects grow only in the summer
    // update, not on 1 January (T, 2026-10-27).
    const prospects = session.cache.getAll("players").filter((p) => p.status === "prospect");
    expect(prospects).toHaveLength(330);
    expect(prospects.every((p) => p.ratingsHistory.length === 1)).toBe(true);
    expect(gameState(session)).toMatchObject({
      phase: "endOfSeason",
      options: ["proceedToPromotionRelegation"],
    });
    // Star's champion is its play-off winner; the table winner is recorded.
    const awards = session.cache.getAll("awards").filter((a) => a.season === 2026);
    const final = session.cache
      .getAll("fixtures")
      .find((f) => f.competition === playoffId("STAR") && f.round === "Final");
    const club = (type: string, competition: string) =>
      awards.filter((a) => a.type === type && a.competition === competition).map((a) => a.cid);
    expect(club("champions", "STAR")).toEqual([final?.result?.winnerCid]);
    expect(club("tableWinner", "STAR")).toHaveLength(1);

    await play(session, "proceedToPromotionRelegation");
    const moved = (from: string, to: string) =>
      session.cache.getAll("clubs").filter((c) => before.get(c.cid) === from && c.leagueId === to)
        .length;
    expect([moved("STAR", "GOLD"), moved("GOLD", "STAR")]).toEqual([2, 2]);
    expect([moved("GOLD", "BLUE"), moved("BLUE", "GOLD")]).toEqual([2, 2]);
    expect(moved("STAR", "BLUE") + moved("BLUE", "STAR")).toBe(0);
  });

  it(
    "then the draft lottery, the draft (held) and the re-signing period, to preseason",
    SLOW,
    async () => {
      const session = await openLeague(1);
      const steps: [string, string, string][] = [];
      for (;;) {
        const [option] = gameState(session).options;
        if (!option) break;
        const report = await play(session, option);
        steps.push([option, report.to, report.phase]);
        if (option === "advanceToPreseason") break;
      }
      expect(steps).toEqual([
        ["untilDraftLottery", "2027-06-05", "draftLottery"],
        ["untilDraft", "2027-06-15", "draft"],
        ["untilResigning", "2027-06-16", "resigning"],
        ["advanceToPreseason", "2027-07-01", "preseason"],
      ]);
      expect((session.cache.get("meta", "game") as GameMeta).season).toBe(2027);
      expect(session.cache.getAll("players").some((p) => p.status === "academy")).toBe(false);
      // The draft was held on reaching it: two rounds of 48, the user's club's picks too.
      await session.cache.flush();
      const saved = await session.db.getAllFromIndex("transactions", "season", 2026);
      const picks = saved.filter((t) => t.type === "draft");
      expect(picks).toHaveLength(96);
      const rookies = session.cache.getAll("players").filter((p) => p.draft?.season === 2026);
      expect(rookies.filter((p) => p.cid === 39)).toHaveLength(2);
      // Preseason 2027: the waiting classes had their summer update; the new one arrived.
      const waiting = session.cache.getAll("players").filter((p) => p.status === "prospect");
      const of = (s: number) => waiting.filter((p) => p.draftSeason === s);
      expect([of(2027).length, of(2028).length, of(2029).length]).toEqual([110, 110, 110]);
      expect(of(2027).every((p) => p.ratingsHistory.length === 2)).toBe(true);
      expect(of(2029).every((p) => p.ratingsHistory.length === 1)).toBe(true);
    },
  );
});
