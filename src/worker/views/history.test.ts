import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import {
  getFinances,
  getHistory,
  getPowerRankings,
  getTeamHistory,
  getTransactions,
} from "./history";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("history pages", () => {
  it(
    "record a finished season, a club's seasons, transactions, rankings and finances",
    { timeout: 300_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "History",
        seed: "history-view",
        userCid: 0,
      });
      const session = await openLeague(league.lid);
      expect((await getHistory(league.lid)).seasons).toEqual([]);

      await play(session, "untilWindowCloses");
      const rankings = await getPowerRankings(league.lid);
      expect(rankings.rows.length).toBe(session.cache.getAll("clubs").length);
      expect(
        rankings.rows.every((r, i) => i === 0 || r.score <= (rankings.rows[i - 1]?.score ?? 99)),
      ).toBe(true);
      expect(rankings.rows.every((r) => r.fullStrength >= r.strength)).toBe(true);
      expect(rankings.rows.every((r) => r.position !== null)).toBe(true);

      const summer = await getTransactions(league.lid, null);
      expect(summer.season).toBe(2026);
      expect(summer.rows.some((r) => r.type === "transfer" && r.fee > 0)).toBe(true);
      expect(
        summer.rows.every((r, i) => i === 0 || r.xid < (summer.rows[i - 1]?.xid ?? Infinity)),
      ).toBe(true);
      expect(summer.rows.every((r) => r.text.length > 0 && !r.text.includes("?"))).toBe(true);

      const live = await getFinances(league.lid, null);
      expect(live.current).toBe(true);
      expect(live.rows.length).toBe(session.cache.getAll("clubs").length);
      expect(live.rows.every((r) => r.wages !== null && r.wages > 0 && r.ffp !== null)).toBe(true);

      await play(session, "untilEndOfSeason");
      await play(session, "proceedToPromotionRelegation");
      await play(session, "advanceToPreseason");

      const history = await getHistory(league.lid);
      expect(history.seasons.map((s) => s.season)).toEqual([2026]);
      const [s2026] = history.seasons;
      const eng1 = s2026?.leagues.find((l) => l.id === "ENG1");
      const eng2 = s2026?.leagues.find((l) => l.id === "ENG2");
      expect(eng1?.champion?.name).toBeTruthy();
      expect(eng1?.relegated).toHaveLength(3);
      expect(eng2?.promoted).toHaveLength(3);
      expect(eng2?.playoffWinner).not.toBeNull();
      expect(eng1?.goldenBoot?.goals).toBeGreaterThan(10);
      expect(eng1?.playerOfTheYear?.name).toBeTruthy();
      expect(s2026?.cups.every((c) => c.winner !== null)).toBe(true);

      const champion = eng1?.champion?.cid ?? -1;
      const team = await getTeamHistory(league.lid, champion);
      const past = team.seasons.find((s) => s.season === 2026);
      expect(team.seasons[0]?.current).toBe(true);
      expect(past?.finish).toBe(1);
      expect(past?.played).toBe(38);
      expect(past?.honours).toContain(`${eng1?.name} champions`);
      expect(past?.topScorer?.goals).toBeGreaterThan(0);
      expect(team.honours.find((h) => h.label === `${eng1?.name} champions`)?.seasons).toEqual([
        2026,
      ]);
      const relegated = await getTeamHistory(league.lid, eng1?.relegated[0]?.cid ?? -1);
      expect(relegated.honours.some((h) => h.label.startsWith("Relegated"))).toBe(false);
      expect(
        relegated.seasons
          .find((s) => s.season === 2026)
          ?.honours.some((h) => h.startsWith("Relegated")),
      ).toBe(true);

      const old = await getTransactions(league.lid, 2026);
      expect(old.rows.length).toBeGreaterThan(summer.rows.length);
      expect(old.rows.some((r) => r.type === "retirement")).toBe(true);

      const books = await getFinances(league.lid, 2026);
      expect(books.current).toBe(false);
      expect(books.rows.every((r) => r.wages === null && r.ffp === null)).toBe(true);
      expect(books.rows.every((r) => r.revenue > 0 && r.squadCostRatio !== null)).toBe(true);
      expect(books.rows.every((r) => r.profit === r.revenue - r.expenses)).toBe(true);
    },
  );
});
