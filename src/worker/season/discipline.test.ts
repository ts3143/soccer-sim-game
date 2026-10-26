import { describe, expect, it } from "vitest";
import type { Fixture, Player } from "../../common/schema";
import type { MatchResult } from "../engine/types";
import { generateWorld } from "../generate/world";
import { selectable, currentSetup } from "../club/tactics";
import { applyDiscipline, isSuspended, YELLOWS_PER_BAN } from "./discipline";
import { pickMatchday, squadPlay } from "./squads";
import { createSeason } from "./season";
import { simulateMatch } from "../engine/match";

const world = generateWorld({
  seed: "discipline",
  name: "test",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const fixture = { homeCid: 0, awayCid: 1, date: "2026-08-01", season: 2026 } as Fixture;
const cards = (pid: number, ...shown: ("yellow" | "red" | "secondYellow")[]): MatchResult =>
  ({
    keyEvents: shown.map((card, i) => ({ type: "card", pid, card, side: 0, clock: 100 * (i + 1) })),
  }) as MatchResult;
const player = () =>
  structuredClone(world.players.find((p) => p.cid === 0 && p.status === "club")!);

describe("domestic suspensions", () => {
  it("issues one match for second yellow, three for straight red, supporting old saves", () => {
    const p = player();
    expect(isSuspended(p)).toBe(false);
    applyDiscipline([p], fixture, cards(p.pid, "secondYellow"));
    expect(p.suspension?.remaining).toBe(1);
    const q = player();
    applyDiscipline([q], fixture, cards(q.pid, "red"));
    expect(q.suspension?.remaining).toBe(3);
  });
  it("bans for one match on every fifth yellow of a season, served from the next match", () => {
    const p = player();
    const on = (day: number) => ({ ...fixture, date: `2026-09-${String(day).padStart(2, "0")}` });
    for (let day = 1; day < YELLOWS_PER_BAN; day++)
      applyDiscipline([p], on(day), cards(p.pid, "yellow"));
    expect(p.yellows).toEqual({ season: 2026, count: 4 });
    expect(isSuspended(p)).toBe(false);
    applyDiscipline([p], on(5), cards(p.pid, "yellow"));
    expect(p.suspension).toEqual({ remaining: 1, date: "2026-09-05" });
    const none = { keyEvents: [] } as unknown as MatchResult;
    applyDiscipline([p], on(9), none);
    expect(isSuspended(p)).toBe(false);
    // The tenth earns another; a new season starts again from zero.
    for (let day = 10; day < 15; day++) applyDiscipline([p], on(day), cards(p.pid, "yellow"));
    expect(p.suspension?.remaining).toBe(1);
    applyDiscipline([p], on(20), none);
    applyDiscipline([p], { ...fixture, date: "2027-08-10", season: 2027 }, cards(p.pid, "yellow"));
    expect(p.yellows).toEqual({ season: 2027, count: 1 });
    expect(isSuspended(p)).toBe(false);
  });
  it("leaves the yellows of a second-yellow dismissal to its ban", () => {
    const p = player();
    p.yellows = { season: 2026, count: 4 };
    applyDiscipline([p], fixture, cards(p.pid, "yellow", "secondYellow"));
    expect(p.yellows.count).toBe(4);
    expect(p.suspension?.remaining).toBe(1);
  });
  it("serves bans on club fixtures only, after the sending-off date, including while injured", () => {
    const p = player();
    applyDiscipline([p], fixture, cards(p.pid, "red"));
    const empty = { keyEvents: [] } as unknown as MatchResult;
    applyDiscipline([p], fixture, empty);
    expect(p.suspension?.remaining).toBe(3);
    applyDiscipline([p], { ...fixture, date: "2026-08-04", homeCid: 2, awayCid: 3 }, empty);
    expect(p.suspension?.remaining).toBe(3);
    p.injury = { type: "test", until: "2026-09-01", since: fixture.date } as Player["injury"];
    for (const date of ["2026-08-05", "2026-08-08", "2026-08-12"])
      applyDiscipline([p], { ...fixture, date }, empty);
    expect(isSuspended(p)).toBe(false);
  });
  it("excludes suspended players from matchday squads, but not from saved lineups", () => {
    const club = structuredClone(world.clubs[0]!);
    const players = structuredClone(world.players.filter((p) => p.cid === club.cid));
    const p = players.find((p) => p.status === "club")!;
    p.suspension = { remaining: 1, date: "2026-07-31" };
    const pick = pickMatchday(club, players, {
      date: fixture.date,
      importance: 1,
      nextImportance: 0,
    });
    expect([...pick.lineup, ...pick.bench]).not.toContain(p.pid);
    // The user's tactics keep him (T, 2026-10-25); a simulated match leaves him out.
    club.tactics.lineup = { slots: [p.pid, ...pick.lineup.slice(1)], bench: [] };
    expect(currentSetup(club, players, fixture.date).slots).toContain(p.pid);
    const ctx = { date: fixture.date, importance: 1, nextImportance: 0 };
    const simulated = pickMatchday(club, players, { ...ctx, preferred: club.tactics.lineup });
    expect([...simulated.lineup, ...simulated.bench]).not.toContain(p.pid);
    expect(selectable(players, club.cid, fixture.date).some((x) => x.pid === p.pid)).toBe(true);
  });
  it("applies discipline through the shared sim/live finish path and marks absent players dirty", () => {
    const players = structuredClone(world.players);
    const state = createSeason({
      clubs: world.clubs,
      season: 2026,
      seed: "discipline-season",
      lastFinish: new Map(),
      firstFid: 1,
    });
    const f = state.fixtures[0]!;
    const runner = squadPlay(state, world.clubs, players, null);
    const p = players.find((p) => p.cid === f.homeCid && p.status === "club")!;
    p.suspension = { remaining: 2, date: "2026-07-01" };
    const { home, away } = runner.prepare(f);
    const result = simulateMatch({
      seed: "discipline-match",
      home,
      away,
      neutralVenue: false,
      style: { chanceQuality: 1, foulRate: 1, directness: 0 },
      knockout: null,
      feed: false,
    });
    runner.finish(f, result);
    expect(p.suspension.remaining).toBe(1);
    expect(runner.changed.has(p.pid)).toBe(true);
  });
});
