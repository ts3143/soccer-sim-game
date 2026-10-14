import { describe, expect, it } from "vitest";
import { POSITIONS, RATING_COUNT, RATING_INDEX, ratingsConfig } from "../../common/config/ratings";
import {
  bestPosition,
  ovrBand,
  positionOvr,
  positionOvrs,
  rawPositionOvr,
  secondaryPositions,
  slotOvr,
  weightedMean,
  wrongFootPenalty,
} from "./ovr";

const flat = (value: number) => new Array<number>(RATING_COUNT).fill(value);

describe("OVR", () => {
  it("is the scaled weighted mean of the position's ratings", () => {
    for (const position of POSITIONS) {
      const { scale, offset } = ratingsConfig.ovrScaling[position];
      expect(rawPositionOvr(flat(60), position)).toBeCloseTo(offset + scale * 60, 6);
    }
  });

  it("only depends on ratings the position weighs", () => {
    const ratings = flat(50);
    ratings[RATING_INDEX.gkr] = 99; // a GK rating, irrelevant for a striker
    expect(weightedMean(ratings, "ST")).toBe(50);
    ratings[RATING_INDEX.fin] = 80; // heavy (3) striker rating
    expect(weightedMean(ratings, "ST")).toBeGreaterThan(50);
  });

  it("is a pure function of the ratings", () => {
    const ratings = Array.from({ length: RATING_COUNT }, (_, i) => 30 + ((i * 7) % 50));
    expect(positionOvrs(ratings)).toEqual(positionOvrs([...ratings]));
  });

  it("rounds and clamps to 0-100", () => {
    expect(positionOvr(flat(100), "CM")).toBeLessThanOrEqual(100);
    expect(positionOvr(flat(0), "CM")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(positionOvr(flat(57.3), "W"))).toBe(true);
  });

  it("lists the best position and close secondary positions", () => {
    const ovrs = [40, 70, 69, 66, 68, 60, 50, 45, 44, 52]; // GK CB FB WB DM CM WM AM W ST
    expect(bestPosition(ovrs)).toBe("CB");
    expect(secondaryPositions(ovrs, "CB")).toEqual(["FB", "DM"]);
  });

  it("applies the wrong-foot penalty on sided slots only, never for wingers", () => {
    expect(wrongFootPenalty("FB", "L", "R")).toBe(2);
    expect(wrongFootPenalty("FB", "L", "L")).toBe(0);
    expect(wrongFootPenalty("WB", "R", "L")).toBe(2);
    expect(wrongFootPenalty("W", "L", "R")).toBe(0);
    expect(wrongFootPenalty("CB", "C", "L")).toBe(0);
    const player = { ovrs: [40, 60, 70, 65, 50, 50, 50, 50, 50, 50], foot: "R" as const };
    expect(slotOvr(player, { position: "FB", side: "R" })).toBe(70);
    expect(slotOvr(player, { position: "FB", side: "L" })).toBe(68);
  });

  it("uses ZenGM's band labels", () => {
    expect(ovrBand(86)).toBe("All-time great");
    expect(ovrBand(75)).toBe("MVP candidate");
    expect(ovrBand(55)).toBe("Starter");
    expect(ovrBand(30)).toBe("Bad player");
  });
});
