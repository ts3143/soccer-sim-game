import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import { getCups, getSchedule, getStandings, weekStart } from "./competitions";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("league and cup pages", () => {
  it(
    "show a live table, a finished season, cup rounds and the weekly schedule",
    { timeout: 240_000 },
    async () => {
      const league = await createLeague({ name: "Comps", seed: "comps-view", userCid: 21 });
      const session = await openLeague(league.lid);
      const opening = await getStandings(league.lid, null, null);
      expect(opening).toMatchObject({ leagueId: "ENG2", season: 2026, current: true });
      expect(opening.rows).toHaveLength(24);
      expect(opening.zones.map((z) => z.zone)).toEqual(["champions", "promoted", "playoffs"]);

      const firstWeek = await getSchedule(league.lid, null);
      expect(firstWeek.week).toBe(weekStart(firstWeek.matches[0]?.date ?? ""));
      expect(firstWeek.weeks.reduce((s, w) => s + w.matches, 0)).toBeGreaterThan(1000);

      await play(session, "untilEndOfSeason");
      const live = await getStandings(league.lid, "ENG1", 2026);
      expect(live.rows.every((r) => r.played === 38 && r.form?.length === 5)).toBe(true);
      const playoffs = await getCups(league.lid, "ENG2-PO", 2026);
      const semis = playoffs.rounds.find((r) => r.name === "Semi-finals");
      expect(semis?.ties).toHaveLength(2);
      expect(
        semis?.ties.every((t) => t.legs.length === 2 && t.aggregate !== null && t.winner),
      ).toBe(true);
      expect(playoffs.winner).not.toBeNull();
      expect(playoffs.competitions.map((c) => c.id)).toEqual(["ENGCUP", "GERCUP", "ENG2-PO"]);

      await play(session, "proceedToPromotionRelegation");
      await play(session, "advanceToPreseason");
      const past = await getStandings(league.lid, "ENG2", 2026);
      expect(past.current).toBe(false);
      expect(past.rows.map((r) => r.position)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
      expect(past.notes.some((n) => n.startsWith("Champions: "))).toBe(true);
      expect(past.notes.some((n) => n.startsWith("Play-off winners: "))).toBe(true);
      const pastCup = await getCups(league.lid, "ENGCUP", 2026);
      expect(pastCup.winner?.name).toBeTruthy();
      expect(pastCup.rounds[0]?.ties.length).toBeGreaterThan(5);
    },
  );
});
