import { expect, it } from "vitest";
import { RATING_CODES, RATING_INDEX, type RatingCode } from "../common/config/ratings";
import { skillTags } from "./skillTags";
const ratings = (values: Partial<Record<RatingCode, number>> = {}) =>
  RATING_CODES.map((c) => values[c] ?? 50);
const codes = (values: Partial<Record<RatingCode, number>>, position = "CM") =>
  skillTags(ratings(values), position).map((t) => t.code);

it("uses inclusive 70 cutoffs for individual strengths, without mutating ratings", () => {
  for (const [rating, tag] of [
    ["spd", "Pc"],
    ["str", "St"],
    ["drb", "Dr"],
    ["fin", "Fi"],
    ["stp", "Sp"],
    ["crs", "Cr"],
  ] as const) {
    expect(codes({ [rating]: 69 })).not.toContain(tag);
    expect(codes({ [rating]: 70 })).toContain(tag);
  }
  const input = Object.freeze(ratings({ spd: 70 }));
  expect(skillTags(input, "CM").map((t) => t.code)).toEqual(["Pc"]);
  expect(input[RATING_INDEX.spd]).toBe(70);
});
it("combines passing strengths while enforcing every agreed minimum", () => {
  expect(codes({ spa: 70, oiq: 70, lpa: 70 })).toContain("Pa");
  expect(codes({ spa: 80, oiq: 70, lpa: 55 })).toContain("Pa");
  expect(codes({ spa: 60, oiq: 80, lpa: 75 })).toContain("Pa");
  expect(codes({ spa: 80, oiq: 60, lpa: 75 })).toContain("Pa");
  expect(codes({ spa: 70, oiq: 70, lpa: 69 })).not.toContain("Pa");
  for (const values of [
    { spa: 59, oiq: 100, lpa: 100 },
    { spa: 100, oiq: 59, lpa: 100 },
    { spa: 100, oiq: 100, lpa: 54 },
  ])
    expect(codes(values)).not.toContain("Pa");
});
it("requires heading competence as well as the weighted aerial score", () => {
  expect(codes({ hdr: 65, jmp: 75, str: 75 })).toContain("Ae");
  expect(codes({ hdr: 64, jmp: 100, str: 100 })).not.toContain("Ae");
  expect(codes({ hdr: 65, jmp: 74, str: 75 })).not.toContain("Ae");
});
it("requires both a qualifying average and minimums for ball winners and engines", () => {
  for (const [a, b, tag] of [
    ["tkl", "ant", "Bw"],
    ["end", "wrk", "En"],
  ] as const) {
    expect(codes({ [a]: 65, [b]: 75 })).toContain(tag);
    expect(codes({ [a]: 75, [b]: 65 })).toContain(tag);
    expect(codes({ [a]: 65, [b]: 74 })).not.toContain(tag);
    expect(codes({ [a]: 64, [b]: 100 })).not.toContain(tag);
    expect(codes({ [a]: 100, [b]: 64 })).not.toContain(tag);
  }
});
it("restricts goalkeeping tags, keeps set pieces separate from penalties, and has no deep passer tag", () => {
  expect(codes({ gkr: 70, gkh: 70 }, "GK")).toEqual(["Rf", "Ha"]);
  expect(codes({ gkr: 69, gkh: 69 }, "GK")).toEqual([]);
  expect(codes({ gkr: 100, gkh: 100 }, "ST")).toEqual([]);
  expect(codes({ pen: 100 })).not.toContain("Sp");
  const all = skillTags(
    RATING_CODES.map(() => 100),
    "GK",
  );
  expect(all).toHaveLength(12);
  expect(all.map((t) => t.code)).not.toContain("Dp");
  expect(all.every((t) => t.description.includes("no gameplay effect"))).toBe(true);
  expect(skillTags([], "GK")).toEqual([]);
});

it("uses the same displayed integers in raw squad ratings and rounded profile ratings", () => {
  const raw = ratings({ spd: 69.6, spa: 79.6, oiq: 69.6, lpa: 54.6 });
  expect(skillTags(raw, "CM")).toEqual(skillTags(raw.map(Math.round), "CM"));
  expect(codes({ spd: 69.6 })).toContain("Pc");
  expect(codes({ spd: 69.4 })).not.toContain("Pc");
});
