import { describe, expect, it } from "vitest";
import { formationById } from "../../common/config/formations";
import { RATING_COUNT } from "../../common/config/ratings";
import { COEFFICIENTS } from "./coefficients";
import {
  computeTeamRatings,
  effectiveRatings,
  formationPlan,
  RATING_SCALE,
  type SlotOccupant,
} from "./teamRatings";

const flat = (value: number): number[] => new Array<number>(RATING_COUNT).fill(value);
const team = (value: number, foot: "L" | "R" = "R"): SlotOccupant[] =>
  Array.from({ length: 11 }, () => ({ ratings: flat(value), foot }));
const NO_SLIDERS = { mentality: 0, pressing: 0, directness: 0 };
const ratings = (formation: string, slots: (SlotOccupant | null)[], sliders = NO_SLIDERS) =>
  computeTeamRatings(
    formationPlan(formationById(formation)),
    slots,
    flat(60),
    sliders,
    COEFFICIENTS,
  );

describe("team ratings", () => {
  it("rise with player quality", () => {
    const weak = ratings("4-3-3", team(50));
    const strong = ratings("4-3-3", team(70));
    for (const key of Object.keys(weak) as (keyof typeof weak)[]) {
      if (key === "setPieces") continue; // the taker is fixed in this test
      expect(strong[key]).toBeGreaterThan(weak[key]);
    }
  });

  it("reward formations that commit more players to a function", () => {
    const players = team(65);
    expect(ratings("4-2-3-1", players).attack).toBeGreaterThan(ratings("5-3-2", players).attack);
    expect(ratings("5-3-2", players).defence).toBeGreaterThan(ratings("4-4-2", players).defence);
  });

  it("move with the sliders as specified", () => {
    const players = team(65);
    const base = ratings("4-4-2", players);
    const attacking = ratings("4-4-2", players, { mentality: 2, pressing: 0, directness: 0 });
    expect(attacking.attack).toBeGreaterThan(base.attack);
    expect(attacking.defence).toBeLessThan(base.defence);
    expect(
      ratings("4-4-2", players, { mentality: 0, pressing: 2, directness: 0 }).pressing,
    ).toBeGreaterThan(base.pressing);
    expect(
      ratings("4-4-2", players, { mentality: 0, pressing: 0, directness: -2 }).passing,
    ).toBeGreaterThan(base.passing);
  });

  it("drop when a slot is empty (red card) or a full-back plays on his wrong side", () => {
    const players = team(65);
    const full = ratings("4-4-2", players);
    const tenMen = ratings(
      "4-4-2",
      players.map((p, i) => (i === 2 ? null : p)),
    ); // a centre-back
    expect(tenMen.defence).toBeLessThan(full.defence);
    // 4-4-2 slots: GK, FB R, CB, CB, FB L, … Correct: left-footed left-back, right-footed right-back.
    const footed = (leftSlots: number[]) =>
      team(65).map((p, i) => ({
        ...p,
        foot: leftSlots.includes(i) ? ("L" as const) : ("R" as const),
      }));
    const correct = ratings("4-4-2", footed([4]));
    const swapped = ratings("4-4-2", footed([1]));
    expect(swapped.defence).toBeLessThan(correct.defence);
  });

  it("use the GK's OVR and the taker's set-piece rating", () => {
    const r = ratings("4-3-3", team(65));
    // On the OVR scale via RATING_SCALE (the taker's stp is 60 here).
    expect(r.setPieces).toBeCloseTo(
      (60 - RATING_SCALE.setPieces.offset) / RATING_SCALE.setPieces.scale,
      6,
    );
    expect(r.goalkeeping).toBeGreaterThan(40);
  });
});

describe("effective ratings", () => {
  it("lose up to 15% on physical ratings and half that elsewhere; height never tires", () => {
    const fresh = flat(80);
    const tired = effectiveRatings(fresh, 0, COEFFICIENTS);
    expect(tired[0]).toBe(80); // hgt
    expect(tired[2]).toBeCloseTo(80 * 0.85, 6); // spd (physical)
    expect(tired[8]).toBeCloseTo(80 * 0.925, 6); // fin (technical)
    expect(effectiveRatings(fresh, 1, COEFFICIENTS)).toEqual(fresh);
  });
});
