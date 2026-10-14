import { describe, expect, it } from "vitest";
import { POSITIONS, RATING_COUNT, RATING_INDEX } from "../../common/config/ratings";
import { ageOn } from "../../common/dates";
import { POSITION_INDEX } from "../core/ovr";
import { Random } from "../core/random";
import { generatePlayer, heightToRating, type PlayerSpec } from "./player";

const spec = (overrides: Partial<PlayerSpec> = {}): PlayerSpec => ({
  position: "CB",
  side: "C",
  quality: 65,
  age: 25,
  nationality: "ENG",
  status: "club",
  cid: 0,
  ...overrides,
});

const make = (seed: string, overrides: Partial<PlayerSpec> = {}) =>
  generatePlayer(Random.fromSeed(seed), spec(overrides), 1, 2026, "2026-07-01");

describe("generatePlayer", () => {
  it("hits the target OVR at the generated position", () => {
    for (const position of POSITIONS) {
      for (const quality of [40, 55, 70, 82]) {
        const player = make(`${position}-${quality}`, { position, quality });
        const atPosition = player.ovrs[POSITION_INDEX[position]] as number;
        expect(Math.abs(atPosition - quality)).toBeLessThanOrEqual(1);
        expect(player.ovr).toBeGreaterThanOrEqual(atPosition); // listed = best position
      }
    }
  });

  it("produces 22 integer ratings in range with height fixed from centimetres", () => {
    const player = make("ratings");
    const ratings = player.ratingsHistory[0]?.ratings ?? [];
    expect(ratings).toHaveLength(RATING_COUNT);
    expect(ratings.every((r) => Number.isInteger(r) && r >= 0 && r <= 100)).toBe(true);
    expect(ratings[RATING_INDEX.hgt]).toBe(heightToRating(player.heightCm));
  });

  it("makes goalkeepers poor outfielders and outfielders poor goalkeepers", () => {
    const gk = make("gk", { position: "GK", quality: 70 });
    expect(gk.position).toBe("GK");
    expect(gk.ovrs[POSITION_INDEX.ST]).toBeLessThan(45);
    const st = make("st", { position: "ST", quality: 70 });
    expect(st.ovrs[POSITION_INDEX.GK]).toBeLessThan(30);
  });

  it("sets the age, a ceiling at or above OVR, and more headroom when young", () => {
    const young = Array.from({ length: 40 }, (_, i) => make(`y${i}`, { age: 17, quality: 50 }));
    const prime = Array.from({ length: 40 }, (_, i) => make(`p${i}`, { age: 28, quality: 65 }));
    for (const p of [...young, ...prime]) expect(p.hidden.ceiling).toBeGreaterThanOrEqual(p.ovr);
    expect(ageOn(young[0]?.birthDate ?? "", "2026-07-01")).toBe(17);
    const headroom = (ps: typeof young) =>
      ps.reduce((s, p) => s + p.hidden.ceiling - p.ovr, 0) / ps.length;
    expect(headroom(young)).toBeGreaterThan(headroom(prime) + 10);
  });

  it("follows the preferred-foot odds by slot side", () => {
    const leftShare = (side: "L" | "R") =>
      Array.from({ length: 400 }, (_, i) => make(`${side}${i}`, { position: "FB", side })).filter(
        (p) => p.foot === "L",
      ).length / 400;
    expect(leftShare("L")).toBeGreaterThan(0.5);
    expect(leftShare("R")).toBeLessThan(0.2);
  });

  it("is deterministic for a seed", () => {
    expect(make("same")).toEqual(make("same"));
    expect(make("same")).not.toEqual(make("other"));
  });
});
