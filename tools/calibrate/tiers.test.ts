import { describe, expect, it } from "vitest";
import { worlds } from "../../src/common/config/worlds";
import type { ClubMove } from "../../src/worker/season/season";
import {
  lastShape,
  mobility,
  moveProblems,
  playerCountDrift,
  rise,
  riseBreakdown,
  shapeDrift,
  tierStrengths,
  type TierRun,
  type TierSeason,
  yoYo,
} from "./tiers";
import type { SquadShape } from "./world";

const shape: SquadShape = {
  min: 22,
  max: 24,
  seniorMeanOvr: 62,
  elite75Share: 0.1,
  meanAge: 26,
  under23Share: 0.25,
  age30plusShare: 0.2,
  ovrAge21to23: 60,
  ovrAge24to26: 63,
  ovrAge27to29: 64,
};

/** A season of a toy world: three leagues of four, club IDs top first. */
const season = (
  star: number[],
  gold: number[],
  blue: number[],
  moves: ClubMove[] = [],
): TierSeason => ({
  tables: { STAR: star, GOLD: gold, BLUE: blue },
  moves,
  seniors: shape,
  freeAgents: 100,
  cap: { over: 0, taxPaid: 0, afterGrace: 0 },
  trades: { count: 0, players: 0, picks: 0 },
  strengths: {},
});
const run = (...seasons: TierSeason[]): TierRun => ({
  seed: "toy",
  seasons,
  activeAtStart: 0,
  activeAfter: [],
  retirements: [],
  exploits: {
    starsChecked: 0,
    starsEqualled: 0,
    starsBought: 0,
    picksChecked: 0,
    picksOutOfOrder: 0,
  },
  picksHeld: { most: 0, none: 0 },
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

  it("measures how far the tiers stand apart and how much strength decides a table", () => {
    const s = (strengths: Record<string, number[]>): TierSeason => ({
      ...season([1, 2, 3], [4, 5, 6], [7, 8, 9]),
      strengths,
    });
    const t = tierStrengths([
      run(
        s({ STAR: [72, 71, 70], BLUE: [64, 66, 65] }),
        s({ STAR: [74, 72, 70], BLUE: [66, 65, 64] }),
      ),
    ]);
    // Star: the strongest first both seasons (1); Blue: reversed once, then in order (0).
    expect(t.STAR).toEqual({ mean: 71.5, spread: 3, correlation: 1 });
    expect(t.BLUE?.correlation).toBeCloseTo(0.25);
    expect(t.BLUE?.spread).toBe(2);
  });

  it("takes the rise apart: seasons by league, rises still running, first seasons up", () => {
    // As above: club 12 rises in 3 seasons (a season each in Blue, Gold and Star); clubs 11
    // and 9 are still in Blue. Club 12 went up from Blue after season 2 and finished first
    // in Gold in season 3, then went up again.
    const b = riseBreakdown(
      [
        run(
          season([1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]),
          season([1, 2, 3, 4], [5, 6, 7, 8], [12, 10, 9, 11], [up(12, "BLUE", "GOLD")]),
          season([1, 2, 3, 4], [12, 6, 7, 8], [5, 10, 9, 11], [up(12, "GOLD", "STAR")]),
          season([12, 2, 3, 4], [1, 6, 7, 8], [5, 10, 9, 11]),
        ),
      ],
      "BLUE",
      2,
      "STAR",
      2,
    );
    expect([b.clocks, b.made]).toEqual([3, 1]);
    expect(b.seasonsIn).toEqual({ BLUE: 1, GOLD: 1, STAR: 1 });
    expect(b.runningIn).toEqual({ BLUE: 2 });
    expect(b.firstSeason.GOLD).toEqual({ clubs: 1, meanFinish: 1, topShare: 1, upAgain: 1 });
    expect(b.firstSeason.STAR).toEqual({ clubs: 1, meanFinish: 1, topShare: 1, upAgain: 0 });
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

  it("measures the player count against the start and the squads' drift over the run", () => {
    const aged = (meanAge: number, seniorMeanOvr: number): TierSeason => ({
      ...season([1], [2], [3]),
      seniors: { ...shape, meanAge, seniorMeanOvr },
    });
    const runs = [
      { ...run(aged(26, 62), aged(26.5, 61)), activeAtStart: 1000, activeAfter: [1040, 950] },
      { ...run(aged(26, 62), aged(27.5, 64)), activeAtStart: 1000, activeAfter: [980, 1010] },
    ];
    // The worst season against its world's start: 950 of 1,000.
    expect(playerCountDrift(runs)).toBeCloseTo(0.05);
    // Averaged over the worlds: last season 27.0 and 62.5, season 1 26.0 and 62.0.
    expect(shapeDrift(runs, "meanAge")).toBeCloseTo(1);
    expect(shapeDrift(runs, "seniorMeanOvr")).toBeCloseTo(0.5);
    expect(lastShape(runs, "meanAge")).toBeCloseTo(27);
    // From season 2 (the last): no drift.
    expect(shapeDrift(runs, "meanAge", 2)).toBe(0);
  });
});
