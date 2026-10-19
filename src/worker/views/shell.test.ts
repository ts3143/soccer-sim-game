import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { createLeague } from "../league/session";
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
});
