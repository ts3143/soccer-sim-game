import { describe, expect, it } from "vitest";
import { nationalitiesConfig } from "../../common/config/nationalities";
import { worlds } from "../../common/config/worlds";
import { clubMix, worldMix } from "./identity";

describe("nationality mixes", () => {
  it("gives a club its league's mix, and refuses a club with no mix", () => {
    expect(clubMix("ENG1", "ENG")).toBe(nationalitiesConfig.leagueMix.ENG1);
    expect(clubMix("GER1", "GER")).toBe(nationalitiesConfig.leagueMix.GER1);
    expect(() => clubMix("NOPE", "XXX")).toThrow(/No nationality mix/);
  });

  it("adds a world's league mixes in league order: Classic's as before", () => {
    const expected: Record<string, number> = {};
    for (const id of ["ENG1", "ENG2", "GER1"]) {
      for (const [code, weight] of Object.entries(nationalitiesConfig.leagueMix[id] ?? {}))
        expected[code] = (expected[code] ?? 0) + weight;
    }
    const mix = worldMix(worlds.classic);
    expect(Object.entries(mix)).toEqual(Object.entries(expected));
    expect(worldMix(worlds.classic)).toBe(mix);
  });
});
