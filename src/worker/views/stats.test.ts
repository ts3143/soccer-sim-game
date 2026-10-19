import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import {
  getInjuries,
  getLeagueLeaders,
  getPlayerRatings,
  getPlayerStats,
  getTeamStats,
} from "./stats";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("stats pages", () => {
  it(
    "rank leaders, list ratings and stats, total team stats and list injuries",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({ name: "Stats", seed: "stats-view", userCid: 0 });
      const session = await openLeague(league.lid);
      await play(session, "untilNextMatch");
      await play(session, "untilWindowCloses");

      const leaders = await getLeagueLeaders(league.lid, "ENG1", null);
      expect(leaders.categories.map((c) => c.key)).toContain("goals");
      const goals = leaders.categories.find((c) => c.key === "goals")?.rows ?? [];
      expect(goals.length).toBe(10);
      expect(goals.every((r, i) => i === 0 || r.value <= (goals[i - 1]?.value ?? 99))).toBe(true);
      expect(leaders.categories.find((c) => c.key === "rating")?.note).toMatch(
        /min\. \d+ appearances/,
      );

      const ratings = await getPlayerRatings(league.lid);
      expect(ratings.codes).toHaveLength(22);
      expect(ratings.rows.length).toBeGreaterThan(1500);
      expect(ratings.rows.every((r) => r.ratings.length === 22)).toBe(true);
      expect(ratings.rows.some((r) => r.status === "freeAgent" && r.club === null)).toBe(true);

      const all = await getPlayerStats(league.lid, null, null);
      const eng1 = await getPlayerStats(league.lid, null, "ENG1");
      expect(all.competitions.map((c) => c.id)).toEqual(
        expect.arrayContaining(["ENG1", "ENG2", "GER1"]),
      );
      expect(eng1.rows.every((r) => r.leagueId === "ENG1")).toBe(true);
      expect(all.rows.length).toBeGreaterThan(eng1.rows.length);

      const team = await getTeamStats(league.lid, "ENG1", null);
      expect(team.detailed).toBe(true);
      expect(team.rows).toHaveLength(20);
      const possession = team.rows.reduce((s, r) => s + (r.possession ?? 0), 0) / team.rows.length;
      expect(possession).toBeCloseTo(50, 0);
      expect(team.rows.every((r) => (r.xgFor ?? 0) > 0)).toBe(true);

      const injuries = await getInjuries(league.lid);
      expect(
        injuries.rows.every(
          (r, i) => i === 0 || r.daysLeft <= (injuries.rows[i - 1]?.daysLeft ?? 999),
        ),
      ).toBe(true);
      expect(injuries.rows.every((r) => r.daysLeft >= 0 && r.club.cid >= 0)).toBe(true);
    },
  );
});
