import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { DraftProspectView, PlayOption } from "../../common/api";
import { addDays } from "../../common/dates";
import type { GameMeta } from "../../common/schema";
import { playoffId } from "../season/season";
import { getCups } from "../views/competitions";
import { draftPicksView, draftView } from "../views/draft";
import { draftProspect } from "./draft";
import { gameState, play } from "./game";
import { contractTalks, releasePlayer, renewContract } from "./market";
import { createLeague, openLeague } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// A whole season in a save: several seconds locally, more on CI.
const SLOW = { timeout: 180_000 };

describe("a Super League year in a save", () => {
  it("plays the season, crowns Star's play-off winner, moves 3 up and 3 down", SLOW, async () => {
    const league = await createLeague({
      world: "superLeague",
      name: "Year",
      seed: "super-league-year",
      userCid: 39, // Lyon Gones (Blue): a season his board judges mildly
    });
    const session = await openLeague(league.lid);
    const before = new Map(session.cache.getAll("clubs").map((c) => [c.cid, c.leagueId]));
    // Before the play-offs: their first round if the season ended today (the Play-offs page).
    const positions = async (league: string) =>
      (await getCups(1, playoffId(league), null)).projection?.ties.map((t) => [
        t.home.position,
        t.away.position,
      ]);
    expect(await positions("STAR")).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect(await positions("GOLD")).toEqual([
      [3, 6],
      [4, 5],
    ]);
    await play(session, "untilEndOfSeason");
    expect((await getCups(1, playoffId("STAR"), null)).projection).toBeNull();
    // Three draft classes have been there all season; prospects grow only in the summer
    // update, not on 1 January (T, 2026-10-27).
    const prospects = session.cache.getAll("players").filter((p) => p.status === "prospect");
    expect(prospects).toHaveLength(330);
    expect(prospects.every((p) => p.ratingsHistory.length === 1)).toBe(true);
    // AI clubs traded with each other (not with the user's club), picks too, all saved.
    const trades = session.cache.getAll("transactions").filter((t) => t.type === "trade");
    expect(trades.length).toBeGreaterThan(5);
    expect(trades.every((t) => t.cids.length === 2 && !t.cids.includes(39))).toBe(true);
    const owners = (picks: { season: number; round: number; originalCid: number; cid: number }[]) =>
      picks.map((p) => `${p.season}/${p.round}/${p.originalCid}:${p.cid}`).sort();
    const tradedPicks = session.cache.getAll("draftPicks").filter((p) => p.cid !== p.originalCid);
    expect(tradedPicks.length).toBeGreaterThan(0);
    expect(owners(await session.db.getAll("draftPicks"))).toEqual(
      owners(session.cache.getAll("draftPicks")),
    );
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
    expect([moved("STAR", "GOLD"), moved("GOLD", "STAR")]).toEqual([3, 3]);
    expect([moved("GOLD", "BLUE"), moved("BLUE", "GOLD")]).toEqual([3, 3]);
    expect(moved("STAR", "BLUE") + moved("BLUE", "STAR")).toBe(0);
  });

  it(
    "then the lottery, the draft pick by pick (the user's own pick too), re-signing, preseason",
    SLOW,
    async () => {
      const session = await openLeague(1);
      const steps: [string, string, string][] = [];
      const go = async (option: PlayOption) => {
        expect(gameState(session).options).toContain(option);
        const report = await play(session, option);
        steps.push([option, report.to, report.phase]);
      };
      // Before the lottery: the pool from the final tables, the picks projected.
      let board = draftView(session);
      expect(board).toMatchObject({ status: "notOrdered", seasons: [2026, 2027, 2028] });
      expect(board.lottery?.map((r) => r.odds)).toEqual([20, 17, 15, 13, 11, 9, 8, 7]);
      expect(board.lottery?.every((r) => r.pick === null)).toBe(true);
      let held = draftPicksView(session, 39).picks;
      expect(held.map((p) => [p.season, p.round])).toEqual([
        [2026, 1],
        [2026, 2],
        [2027, 1],
        [2027, 2],
        [2028, 1],
        [2028, 2],
      ]);
      expect(held.map((p) => p.projected !== null)).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
      ]);
      expect((held[1]?.projected?.pick ?? 0) - (held[0]?.projected?.pick ?? 0)).toBe(48);
      // A class to come: its prospects only.
      const later = draftView(session, 2028);
      expect(later).toMatchObject({ status: "class", lottery: null, slots: [] });
      expect(later.prospects).toHaveLength(110);
      await go("untilDraftLottery");
      // The lottery set the order: 96 picks numbered, two of them Lyon's, one a round.
      board = draftView(session);
      expect(board.lottery?.map((r) => r.pick).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(board).toMatchObject({
        season: 2026,
        status: "on",
        onTheClock: null,
        yourTurn: false,
      });
      expect(board.slots.map((s) => s.pick)).toEqual(Array.from({ length: 96 }, (_, i) => i + 1));
      const lyon = board.slots.filter((s) => s.club.cid === 39).map((s) => s.pick);
      expect(lyon).toHaveLength(2);
      expect(lyon[1]).toBe((lyon[0] ?? 0) + 48);
      held = draftPicksView(session, 39).picks;
      expect(held.filter((p) => p.season === 2026).map((p) => [p.pick, p.projected])).toEqual(
        lyon.map((pick) => [pick, null]),
      );
      await go("untilDraft");
      // AI clubs pick up to his turn; on the clock, he can only pick or let the AI finish.
      if (lyon[0] !== 1) {
        expect(gameState(session).options).toEqual(["untilYourPick", "untilEndOfDraft"]);
        await play(session, "untilYourPick");
      }
      board = draftView(session);
      expect(board).toMatchObject({ yourTurn: true, onTheClock: lyon[0] });
      expect(gameState(session).options).toEqual(["untilEndOfDraft"]);
      const choice = board.prospects.at(-1) as DraftProspectView;
      await draftProspect(session, choice.pid);
      await expect(draftProspect(session, choice.pid)).rejects.toThrow("isn't your pick");
      await play(session, "untilEndOfDraft");
      board = draftView(session);
      expect(board.status).toBe("over");
      expect(board.slots.every((s) => s.player !== null)).toBe(true);
      expect(board.slots.find((s) => s.pick === lyon[0])?.player?.pid).toBe(choice.pid);

      // Contracts are renewed only in the re-signing period, final-year players only.
      const lyonPlayers = () =>
        session.cache.getAll("players").filter((p) => p.cid === 39 && p.status === "club");
      const ending = lyonPlayers().filter((p) => p.contract?.expires === "2027-06-30");
      const lasting = lyonPlayers().find((p) => (p.contract?.expires ?? "") > "2027-06-30");
      expect(ending.length).toBeGreaterThan(0);
      expect(contractTalks(session, ending[0]?.pid ?? -1).closedReason).toMatch(
        /only in the re-signing period/,
      );
      await go("untilResigning");
      // Free agency is closed from the roster deadline to 1 July.
      const freeAgent = session.cache.getAll("players").find((p) => p.status === "freeAgent");
      expect(contractTalks(session, freeAgent?.pid ?? -1).closedReason).toMatch(
        /Free agency is closed/,
      );
      const notice = session.cache
        .getAll("inbox")
        .find((m) => m.subject.startsWith("The re-signing period"));
      expect(notice?.players?.map((p) => p.pid).sort()).toEqual(ending.map((p) => p.pid).sort());
      expect(contractTalks(session, lasting?.pid ?? -1).closedReason).toMatch(/final year/);
      const willing = ending.find((p) => contractTalks(session, p.pid).mood.willing);
      if (willing) await renewContract(session, willing.pid, 2);
      // The AI re-signs as the period closes, only players whose contracts ended.
      const aiEnding = new Set(
        session.cache
          .getAll("players")
          .filter((p) => p.cid !== 39 && p.contract?.expires === "2027-06-30")
          .map((p) => p.pid),
      );
      await go("advanceToPreseason");
      for (const p of ending) {
        const now = session.cache.get("players", p.pid);
        if (p === willing) expect(now?.contract?.expires).toBe("2029-06-30");
        else expect(now?.status === "club" && now.cid === 39).toBe(false);
      }
      const renewals = session.cache
        .getAll("transactions")
        .filter((t) => t.type === "renewal" && t.date === "2027-07-01");
      expect(renewals.length).toBeGreaterThan(0);
      expect(renewals.every((t) => aiEnding.has(t.pids[0] ?? -1))).toBe(true);
      expect(steps).toEqual([
        ["untilDraftLottery", "2027-06-05", "draftLottery"],
        ["untilDraft", "2027-06-15", "draft"],
        ["untilResigning", "2027-06-16", "resigning"],
        ["advanceToPreseason", "2027-07-01", "preseason"],
      ]);
      expect((session.cache.get("meta", "game") as GameMeta).season).toBe(2027);
      expect(session.cache.getAll("players").some((p) => p.status === "academy")).toBe(false);
      // Two rounds of 48, the user's club's two picks among them.
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
      // The draft used up its picks; 1 July brought the picks two seasons on.
      const owned = session.cache.getAll("draftPicks");
      expect(owned).toHaveLength(48 * 2 * 3);
      expect([...new Set(owned.map((p) => p.season))].sort()).toEqual([2027, 2028, 2029]);
      expect(await session.db.count("draftPicks")).toBe(48 * 2 * 3);
      // The draft held stays on the page, after it the classes to come.
      expect(draftView(session)).toMatchObject({ season: 2027, seasons: [2026, 2027, 2028, 2029] });
      const held2026 = draftView(session, 2026);
      expect(held2026).toMatchObject({ status: "over", lottery: null, prospects: [] });
      expect(held2026.slots).toHaveLength(96);
    },
  );

  it(
    "from 1 July: free agency; over 25, Play waits on the eve of the first match",
    SLOW,
    async () => {
      const session = await openLeague(1);
      const game = gameState(session);
      expect([game.phase, game.date, game.blocked]).toEqual(["preseason", "2027-07-01", null]);
      const pool = session.cache.getAll("players").filter((p) => p.status === "freeAgent");
      expect(contractTalks(session, pool[0]?.pid ?? -1).closedReason).toBeNull();
      // Lyon over the limit: free agents moved in (a shortcut for his signings).
      const lyon = () =>
        session.cache.getAll("players").filter((p) => p.cid === 39 && p.status === "club");
      for (const p of pool.slice(0, Math.max(0, 27 - lyon().length))) {
        session.cache.put("players", {
          ...p,
          status: "club",
          cid: 39,
          contract: { wage: 300_000, expires: "2028-06-30" },
        });
      }
      const over = lyon().length - 25;
      expect(over).toBeGreaterThanOrEqual(2);
      const first = session.cache
        .getAll("fixtures")
        .filter((f) => f.season === 2027)
        .map((f) => f.date)
        .sort()[0] as string;
      await play(session, "untilNextMatch");
      let state = gameState(session);
      expect(state.date).toBe(addDays(first, -1));
      expect(state.options).toEqual([]);
      expect(state.blocked).toMatch(new RegExp(`release ${over} to play on`));
      // AI clubs signed free agents through the summer, the user first on 1 July.
      const signings = session.cache.getAll("transactions").filter((t) => t.type === "freeAgent");
      expect(signings.length).toBeGreaterThan(0);
      expect(signings.every((t) => t.date > "2027-07-01")).toBe(true);
      for (const p of lyon().slice(0, over)) await releasePlayer(session, p.pid);
      state = gameState(session);
      expect(state.blocked).toBeNull();
      expect(state.options).toContain("untilNextMatch");
      await play(session, "untilNextMatch");
      // The first matchday: every club within 25, AI clubs having trimmed.
      expect(gameState(session).phase).toBe("regularSeason");
      for (const club of session.cache.getAll("clubs")) {
        const n = session.cache
          .getAll("players")
          .filter((p) => p.cid === club.cid && p.status === "club").length;
        expect(n).toBeLessThanOrEqual(25);
      }
    },
  );
});
