import { describe, expect, it } from "vitest";
import { RATING_COUNT } from "../../common/config/ratings";
import {
  ageCurve,
  challengeFactor,
  developHalfSeason,
  devMultiplier,
  effectiveDev,
  minutesFactor,
  type DevelopmentInput,
} from "./development";
import { rawPositionOvr } from "./ovr";
import { Random } from "./random";

const base: DevelopmentInput = {
  age: 20,
  curve: "normal",
  ceiling: 80,
  ovr: 60,
  coaching: 1,
  medical: 1,
  minutesShare: 0.9,
  levelStrength: 62,
  performanceAdj: 0,
  academyYouth: null,
};

/** Mean OVR change at ST after `updates` half-seasons, over many seeded runs. */
function meanOvrChange(input: DevelopmentInput, updates: number, runs = 400): number {
  let sum = 0;
  for (let run = 0; run < runs; run++) {
    const rng = Random.fromSeed(`dev-${run}`);
    let ratings = new Array<number>(RATING_COUNT).fill(input.ovr);
    const start = rawPositionOvr(ratings, "ST");
    let age = input.age;
    for (let u = 0; u < updates; u++) {
      const ovr = rawPositionOvr(ratings, "ST");
      ratings = developHalfSeason(ratings, { ...input, age, ovr }, rng);
      age += 0.5;
    }
    sum += rawPositionOvr(ratings, "ST") - start;
  }
  return sum / runs;
}

describe("age curves", () => {
  it("grow young, peak, then decline more steeply past 30", () => {
    expect(ageCurve("technical", 18, "normal")).toBeGreaterThan(0);
    expect(ageCurve("technical", 27, "normal")).toBeCloseTo(0, 6);
    expect(ageCurve("technical", 34, "normal")).toBeLessThan(ageCurve("technical", 30, "normal"));
  });

  it("time the groups as specified: physical first, mental last", () => {
    expect(ageCurve("physical", 26, "normal")).toBeLessThan(0);
    expect(ageCurve("mental", 30, "normal")).toBeGreaterThan(0);
    expect(ageCurve("goalkeeping", 30, "normal")).toBeGreaterThan(0);
    expect(ageCurve("fixed", 20, "normal")).toBe(0);
  });

  it("shift for early and late bloomers and slow decline for the ageless", () => {
    expect(ageCurve("technical", 25, "early")).toBe(ageCurve("technical", 27, "normal"));
    expect(ageCurve("technical", 29, "late")).toBe(ageCurve("technical", 27, "normal"));
    expect(ageCurve("technical", 34, "ageless")).toBeGreaterThan(
      ageCurve("technical", 34, "normal"),
    );
  });
});

describe("dev multiplier", () => {
  it("has a 0.2 training base with no minutes and rises with minutes", () => {
    expect(devMultiplier({ ...base, minutesShare: 0 })).toBeCloseTo(0.2, 6); // T, 2026-10-15
    expect(devMultiplier({ ...base, minutesShare: 0.9 })).toBeGreaterThan(0.9);
    expect(minutesFactor(0.5)).toBeGreaterThan(0.5); // diminishing returns
  });

  it("rewards the right level and blocks the weak-loan exploit", () => {
    expect(challengeFactor(62, 60)).toBeGreaterThan(0.95);
    expect(challengeFactor(45, 65)).toBeLessThan(0.4); // far too good for the level
    expect(challengeFactor(85, 55)).toBeLessThan(0.5); // badly out of his depth
  });

  it("caps the performance adjustment at ±0.15", () => {
    const neutral = devMultiplier(base);
    expect(devMultiplier({ ...base, performanceAdj: 0.6 })).toBeCloseTo(neutral + 0.15, 6);
    expect(devMultiplier({ ...base, performanceAdj: -0.6 })).toBeCloseTo(neutral - 0.15, 6);
  });

  it("blends to neutral between 23 and 27", () => {
    expect(effectiveDev(0.4, 22)).toBe(0.4);
    expect(effectiveDev(0.4, 25)).toBeCloseTo(0.7, 6);
    expect(effectiveDev(0.4, 27)).toBe(1);
    expect(effectiveDev(1.3, 30)).toBe(1);
  });
});

describe("development", () => {
  it("makes a well-played youngster grow faster than a benched one", () => {
    const played = meanOvrChange({ ...base, minutesShare: 0.9 }, 2);
    const benched = meanOvrChange({ ...base, minutesShare: 0 }, 2);
    expect(played).toBeGreaterThan(benched + 1);
    expect(benched).toBeGreaterThan(0);
  });

  it("does not let a benched 33-year-old decline slower than a starter", () => {
    const veteran = { ...base, age: 33, ovr: 70, ceiling: 70 };
    // Same seeds for both: the only difference is minutes.
    const starter = meanOvrChange({ ...veteran, minutesShare: 0.9 }, 2);
    const benched = meanOvrChange({ ...veteran, minutesShare: 0 }, 2);
    expect(starter).toBeLessThan(0);
    expect(benched).toBeLessThanOrEqual(starter);
  });

  it("never applies the dev multiplier to decline", () => {
    const veteran = { ...base, age: 34, ovr: 70, ceiling: 70, minutesShare: 0 };
    const poorCoaching = meanOvrChange({ ...veteran, coaching: 0.9 }, 2);
    const greatCoaching = meanOvrChange({ ...veteran, coaching: 1.1 }, 2);
    expect(greatCoaching).toBeCloseTo(poorCoaching, 6);
    const goodMedical = meanOvrChange({ ...veteran, medical: 0.92 }, 2);
    expect(goodMedical).toBeGreaterThan(poorCoaching);
  });

  it("slows growth near the ceiling", () => {
    const farFromCeiling = meanOvrChange({ ...base, ceiling: 85 }, 2);
    const nearCeiling = meanOvrChange({ ...base, ceiling: 63 }, 2);
    expect(nearCeiling).toBeLessThan(farFromCeiling);
  });

  it("is deterministic for a seed", () => {
    const ratings = new Array<number>(RATING_COUNT).fill(55);
    expect(developHalfSeason(ratings, base, Random.fromSeed("x"))).toEqual(
      developHalfSeason(ratings, base, Random.fromSeed("x")),
    );
  });
});
