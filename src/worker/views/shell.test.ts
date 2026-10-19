import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import { getDashboard, markAllInboxRead } from "./dashboard";
import { getLeagueShell } from "./shell";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("the app shell's view", () => {
  it(
    "names the league and lists every club, the leagues and the game state",
    { timeout: 60_000 },
    async () => {
      const league = await createLeague({ name: "Shell", seed: "shell-view", userCid: 21 });
      const shell = await getLeagueShell(league.lid);
      expect(shell).toMatchObject({
        lid: league.lid,
        name: "Shell",
        userCid: 21,
        firstSeason: 2026,
      });
      expect(shell.clubs).toHaveLength(62);
      expect(shell.clubs.map((c) => c.name)).toEqual(
        [...shell.clubs.map((c) => c.name)].sort((a, b) => a.localeCompare(b)),
      );
      expect(shell.leagues.map((l) => l.id)).toEqual(["ENG1", "ENG2", "GER1"]);
      expect(shell.state).toMatchObject({ season: 2026, phase: "preseason", date: "2026-07-01" });
      expect(shell.state.options).toContain("untilNextMatch");
    },
  );

  it(
    "feeds the Dashboard: position, results, next match, table, board, inbox",
    { timeout: 120_000 },
    async () => {
      const league = await createLeague({ name: "Dash", seed: "dash-view", userCid: 0 });
      const before = await getDashboard(league.lid);
      expect(before.recent).toEqual([]);
      expect(before.nextMatch?.date).toBe("2026-08-15");
      expect(before.table).toHaveLength(20);
      expect(before.board.target).not.toBe("");
      expect(before.unread).toBeGreaterThan(0);
      const session = await openLeague(league.lid);
      await play(session, "untilNextMatch");
      await play(session, "oneWeek");
      const after = await getDashboard(league.lid);
      expect(after.record.played).toBeGreaterThanOrEqual(1);
      expect(after.recent.length).toBeGreaterThanOrEqual(1);
      expect(after.recent[0]?.score).toMatch(/^\d+–\d+/);
      expect(after.form).toHaveLength(after.recent.length);
      expect(after.position).toBeGreaterThanOrEqual(1);
      expect(after.nextMatch?.opponentForm.length).toBeGreaterThanOrEqual(0);
      await markAllInboxRead(league.lid);
      expect((await getLeagueShell(league.lid)).unread).toBe(0);
    },
  );
});
