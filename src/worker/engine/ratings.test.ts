import { describe, expect, it } from "vitest";
import type { Position } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import { COEFFICIENTS as c } from "./coefficients";
import { matchRating, rawMatchScore, ratingFromOldScale, ratingTotalFromOldScale } from "./ratings";
import { emptyPlayerStats } from "./state";

const R = c.ratings;
const player = (position: Position, patch: Partial<PlayerMatchStats> = {}): PlayerMatchStats => ({
  ...emptyPlayerStats(1, 0, 0, position),
  minutes: 90,
  ...patch,
});
/** The rating before the soft limits and rounding. */
const unbent = (p: PlayerMatchStats, result: "win" | "draw" | "loss") =>
  R.centre + rawMatchScore(p, result, c) - R.expected[p.position];
const round = (x: number) => Math.round(x * 10) / 10;

describe("match ratings (SPEC §8.7)", () => {
  it("are the centre plus the distance from the position's average", () => {
    const cm = player("CM", { passes: 50, passesCompleted: 45, tackles: 2, keyPasses: 1 });
    expect(matchRating(cm, "draw", c)).toBe(round(unbent(cm, "draw")));
    expect(R.centre).toBe(6.9);
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

describe("old-scale ratings (saves before league DB v3)", () => {
  it("map 6.6 to 6.9 and stretch around it, with the soft top", () => {
    expect(ratingFromOldScale(6.6, c)).toBe(6.9);
    expect(ratingFromOldScale(7.6, c)).toBe(8);
    expect(ratingFromOldScale(9.8, c)).toBe(9.4);
    expect(ratingFromOldScale(3, c)).toBe(3);
  });

  it("convert season totals by appearances", () => {
    expect(ratingTotalFromOldScale(13.2, 2, c)).toBe(13.8);
    expect(ratingTotalFromOldScale(0, 0, c)).toBe(0);
  });
});
