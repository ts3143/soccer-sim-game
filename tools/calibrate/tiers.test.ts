import { describe, expect, it } from "vitest";
import { worlds } from "../../src/common/config/worlds";
import type { ClubMove } from "../../src/worker/season/season";
import { mobility, moveProblems, rise, type TierRun, type TierSeason, yoYo } from "./tiers";

/** A season of a toy world: three leagues of four, club IDs top first. */
const season = (
  star: number[],
  gold: number[],
  blue: number[],
  moves: ClubMove[] = [],
): TierSeason => ({
  tables: { STAR: star, GOLD: gold, BLUE: blue },
  moves,
  seniors: { min: 22, max: 24 },
  freeAgents: 100,
  cap: { over: 0, taxPaid: 0, afterGrace: 0 },
});
const run = (...seasons: TierSeason[]): TierRun => ({
  seed: "toy",
  seasons,
  activeAtStart: 0,
  activeAfter: [],
  seconds: 0,
});
const up = (cid: number, from: string, to: string): ClubMove => ({
  cid,
  from,
  to,
  reason: "promoted",
});
const down = (cid: number, from: string, to: string): ClubMove => ({
  cid,
  from,
  to,
  reason: "relegated",
});

describe("tier measures", () => {
  it("times the rise from the bottom of the lowest tier to the top of the highest", () => {
    // Club 12 is bottom of Blue in season 1 and top-two in Star in season 4: 3 seasons.
    // Club 11 (bottom two from season 1) and club 9 (from season 2) never make it.
    const r = rise(
      [
        run(
          season([1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]),
          season([1, 2, 3, 4], [5, 6, 7, 8], [12, 10, 9, 11]),
          season([1, 2, 3, 4], [12, 6, 7, 8], [5, 10, 9, 11]),
          season([12, 2, 3, 4], [1, 6, 7, 8], [5, 10, 9, 11]),
        ),
      ],
      "BLUE",
      2,
      "STAR",
      2,
    );
    expect(r).toEqual({ seasons: [3], never: 2 });
  });

  it("counts a promotion relegated again within two seasons as a yo-yo", () => {
    const y = yoYo([
      run(
        season([1, 2], [3, 4], [5, 6], [up(3, "GOLD", "STAR"), down(2, "STAR", "GOLD")]),
        season([1, 3], [2, 4], [5, 6], [down(3, "STAR", "GOLD"), up(2, "GOLD", "STAR")]),
        season([1, 2], [3, 4], [5, 6]),
        season([1, 2], [3, 4], [5, 6]),
      ),
    ]);
    // Season 1's promotion (club 3) went straight back down; season 2's (club 2) didn't.
    expect(y).toEqual({ promotions: 2, yoYos: 1 });
  });

  it("measures moves per club-season, top-league clubs and the opening top clubs left", () => {
    const m = mobility(
      [
        run(
          season([1, 2], [3, 4], [5, 6], [up(3, "GOLD", "STAR"), down(2, "STAR", "GOLD")]),
          season([1, 3], [2, 4], [5, 6]),
        ),
      ],
      "STAR",
      6,
      [2],
    );
    expect(m).toEqual({ movesPerClubSeason: 2 / 12, topClubs: [3], openingStill: { 2: [1] } });
  });

  it("flags a season whose moves differ from the config", () => {
    const config = worlds.superLeague.competitions;
    const ids = (from: number) => Array.from({ length: 16 }, (_, i) => from + i);
    const right = [
      down(14, "STAR", "GOLD"),
      down(15, "STAR", "GOLD"),
      up(16, "GOLD", "STAR"),
      up(17, "GOLD", "STAR"),
      down(30, "GOLD", "BLUE"),
      down(31, "GOLD", "BLUE"),
      up(32, "BLUE", "GOLD"),
      up(33, "BLUE", "GOLD"),
    ];
    const ok = season(ids(0), ids(16), ids(32), right);
    expect(moveProblems(run(ok), config)).toEqual([]);
    const missing = season(ids(0), ids(16), ids(32), right.slice(1));
    expect(moveProblems(run(missing), config)).toEqual(["toy season 1: 1 down from STAR"]);
  });
});
