import { describe, expect, it } from "vitest";
import type { Position } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import { COEFFICIENTS as c } from "./coefficients";
import {
  manOfTheMatch,
  matchRating,
  ratingCentre,
  rawMatchScore,
  ratingFromOldScale,
  ratingTotalFromOldScale,
} from "./ratings";
import { emptyPlayerStats } from "./state";

const R = c.ratings;
const player = (position: Position, patch: Partial<PlayerMatchStats> = {}): PlayerMatchStats => ({
  ...emptyPlayerStats(1, 0, 0, position),
  minutes: 90,
  ...patch,
});
/** The rating before the soft limits and rounding. */
const unbent = (p: PlayerMatchStats, result: "win" | "draw" | "loss") =>
  ratingCentre(p.position, c) + rawMatchScore(p, result, c) - R.expected[p.position];
const round = (x: number) => Math.round(x * 10) / 10;

describe("match ratings (SPEC §8.7)", () => {
  it("are the centre plus the distance from the position's average", () => {
    const cm = player("CM", { passes: 50, passesCompleted: 45, tackles: 2, keyPasses: 1 });
    expect(matchRating(cm, "draw", c)).toBe(round(unbent(cm, "draw")));
    expect(ratingCentre("CM", c)).toBe(6.9);
  });

  it("centre keepers a little lower, at 6.8", () => {
    expect(ratingCentre("GK", c)).toBeCloseTo(6.8, 10);
    const gk = player("GK", { goalsConceded: 1, psxgFaced: 1.2, passes: 30, passesCompleted: 24 });
    expect(matchRating(gk, "draw", c)).toBe(round(unbent(gk, "draw")));
  });

  it("bend above 8.4, so a 10 stays rare", () => {
    const st = player("ST", { goals: 2, assists: 1, shots: 5, shotsOnTarget: 4 });
    const u = unbent(st, "win");
    expect(u).toBeGreaterThan(R.softTop.from);
    expect(matchRating(st, "win", c)).toBe(
      round(Math.min(10, R.softTop.from + (u - R.softTop.from) * R.softTop.slope)),
    );
  });

  it("pull short cameos toward the centre", () => {
    const stats = { goals: 1, shots: 2, shotsOnTarget: 1 };
    const full = matchRating(player("W", stats), "win", c);
    const cameo = matchRating(player("W", { ...stats, minutes: 20 }), "win", c);
    expect(Math.abs(cameo - R.centre)).toBeLessThan(Math.abs(full - R.centre));
  });

  it("let a midfielder who runs the game reach about 8 without scoring", () => {
    const cm = player("CM", {
      passes: 70,
      passesCompleted: 65,
      progressivePasses: 8,
      keyPasses: 4,
      tackles: 5,
      interceptions: 4,
    });
    expect(matchRating(cm, "draw", c)).toBeGreaterThanOrEqual(7.8);
  });

  it("rate keepers on goals prevented, not just goals conceded", () => {
    const beaten = { goalsConceded: 3, saves: 5 };
    const heroics = player("GK", { ...beaten, psxgFaced: 3.6 });
    const howlers = player("GK", { ...beaten, psxgFaced: 1.2 });
    const gap = matchRating(heroics, "loss", c) - matchRating(howlers, "loss", c);
    expect(gap).toBeGreaterThan(0.9);
  });

  it("soften a keeper's worst days below 5", () => {
    const gk = player("GK", { goalsConceded: 6, psxgFaced: 1.5 });
    const u = unbent(gk, "loss");
    const floor = R.keeperSoftBottom;
    expect(u).toBeLessThan(floor.from);
    expect(matchRating(gk, "loss", c)).toBe(
      round(Math.max(3, floor.from - (floor.from - u) * floor.slope)),
    );
  });
});

describe("man of the match (SPEC §8.7)", () => {
  const line = (pid: number, side: 0 | 1, rating: number, patch: Partial<PlayerMatchStats> = {}) =>
    player("CM", { pid, side, rating, ...patch });

  it("goes to the highest rating, on either side", () => {
    const players = [line(1, 0, 7.4), line(2, 1, 8.3), line(3, 0, 8.2)];
    expect(manOfTheMatch(players, 0)).toBe(2);
  });

  it("breaks ties: winning side, then goals and assists, minutes, then the lower pid", () => {
    expect(manOfTheMatch([line(1, 0, 8.1), line(2, 1, 8.1)], 1)).toBe(2);
    expect(manOfTheMatch([line(1, 0, 8.1), line(2, 0, 8.1, { assists: 1 })], 0)).toBe(2);
    expect(manOfTheMatch([line(1, 0, 8.1, { minutes: 60 }), line(2, 1, 8.1)], null)).toBe(2);
    expect(manOfTheMatch([line(5, 0, 8.1), line(4, 1, 8.1)], null)).toBe(4);
    expect(manOfTheMatch([], null)).toBeNull();
  });
});

describe("old-scale ratings (saves before league DB v3)", () => {
  it("map 6.6 to 6.9 (keepers 6.8) and stretch around it, with the soft top", () => {
    expect(ratingFromOldScale(6.6, "ST", c)).toBe(6.9);
    expect(ratingFromOldScale(6.6, "GK", c)).toBe(6.8);
    expect(ratingFromOldScale(7.6, "CB", c)).toBe(8);
    expect(ratingFromOldScale(9.8, "W", c)).toBe(9.4);
    expect(ratingFromOldScale(3, "CM", c)).toBe(3);
  });

  it("convert season totals by appearances", () => {
    expect(ratingTotalFromOldScale(13.2, 2, "ST", c)).toBe(13.8);
    expect(ratingTotalFromOldScale(13.2, 2, "GK", c)).toBe(13.6);
    expect(ratingTotalFromOldScale(0, 0, "GK", c)).toBe(0);
  });
});
