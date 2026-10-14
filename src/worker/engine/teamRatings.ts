/**
 * The seven team ratings (SPEC §8.2), computed from the players in the formation slots
 * using their effective (energy-adjusted) ratings. Recipes follow the descriptions in
 * data/config/formations_tactics.json → teamRatings:
 *
 *   passing     spa, lpa, drb across the XI, weighted toward CB, DM, CM
 *   attack      oiq, drb, crs, spa, fin, lsh, hdr across AM, W, ST, WB, WM
 *   pressing    wrk, spd, end, ant across the front six
 *   defence     tkl, diq, ant, str across the back line and DM
 *   aerial      hgt, jmp, hdr across the XI
 *   setPieces   the designated taker's stp only
 *   goalkeeping the GK's OVR
 *
 * Each rating = weighted mean quality of the players it covers, plus a small formation
 * effect (formations that put more players into a function score a little higher there),
 * plus slider effects.
 */
import {
  formationsConfig,
  type Formation,
  type FormationSlot,
} from "../../common/config/formations";
import {
  RATING_INDEX,
  ratingsConfig,
  type Position,
  type RatingCode,
} from "../../common/config/ratings";
import type { Foot, SliderSettings } from "../../common/schema";
import { rawPositionOvr, wrongFootPenalty } from "../core/ovr";
import type { Coefficients } from "./coefficients";

export interface TeamRatings {
  passing: number;
  attack: number;
  pressing: number;
  defence: number;
  aerial: number;
  setPieces: number;
  goalkeeping: number;
}

type Recipe = {
  mix: Partial<Record<RatingCode, number>>;
  /** Weight per position group; "frontSix" weighs the six most advanced slots equally. */
  slots: Partial<Record<Position, number>> | "frontSix";
};

const RECIPES = {
  passing: {
    mix: { spa: 0.5, lpa: 0.25, drb: 0.25 },
    slots: { GK: 0.3, CB: 1, FB: 0.8, WB: 0.8, DM: 1.2, CM: 1.2, WM: 0.8, AM: 1, W: 0.6, ST: 0.4 },
  },
  attack: {
    mix: { oiq: 0.2, fin: 0.2, drb: 0.15, spa: 0.1, crs: 0.12, lsh: 0.1, hdr: 0.13 },
    slots: { AM: 1.2, W: 1.1, ST: 1.3, WB: 0.5, WM: 0.8 },
  },
  pressing: { mix: { wrk: 0.35, spd: 0.2, end: 0.25, ant: 0.2 }, slots: "frontSix" },
  defence: {
    mix: { tkl: 0.3, diq: 0.3, ant: 0.2, str: 0.2 },
    slots: { CB: 1.2, FB: 1, WB: 0.8, DM: 1 },
  },
  aerial: {
    mix: { hgt: 0.35, jmp: 0.35, hdr: 0.3 },
    slots: { GK: 0.5, CB: 1, FB: 1, WB: 1, DM: 1, CM: 1, WM: 1, AM: 1, W: 1, ST: 1 },
  },
} satisfies Record<string, Recipe>;

export type RecipeName = keyof typeof RECIPES;
export const RECIPE_NAMES = Object.keys(RECIPES) as RecipeName[];

/** How far up the pitch a position plays (for "front six"). */
const ADVANCEMENT: Record<Position, number> = {
  GK: 0, CB: 1, FB: 1.5, WB: 2.5, DM: 2, CM: 3, WM: 4, AM: 5, W: 5, ST: 6,
}; // prettier-ignore

/** Formation effect: rating points per 100% more weight than the average formation puts there. */
const FORMATION_SCALE = 10;

/**
 * Puts each team rating on the player-OVR scale: rating = (raw − offset) / scale, so a
 * rating of 70 means "plays like an XI averaging 70" in that function at any level of
 * football (otherwise the recipes' mixes drift apart as quality rises, and better
 * leagues would score less). Fitted once by tools/fit-team-ratings.ts.
 */
export const RATING_SCALE: Record<RecipeName | "setPieces", { offset: number; scale: number }> = {
  passing: { offset: 0.84, scale: 0.855 },
  attack: { offset: 1.17, scale: 0.884 },
  pressing: { offset: 0.18, scale: 0.907 },
  defence: { offset: -0.28, scale: 1.016 },
  aerial: { offset: 21.47, scale: 0.458 },
  setPieces: { offset: 29.6, scale: 0.514 },
};

function slotWeights(formation: Formation, recipe: Recipe): number[] {
  if (recipe.slots === "frontSix") {
    const order = formation.slots
      .map((slot, i) => ({ i, a: ADVANCEMENT[slot.position] }))
      .sort((x, y) => y.a - x.a || x.i - y.i)
      .slice(0, 6)
      .map((x) => x.i);
    return formation.slots.map((_, i) => (order.includes(i) ? 1 : 0));
  }
  const weights = recipe.slots;
  return formation.slots.map((slot) => weights[slot.position] ?? 0);
}

/** Per recipe: the average total slot weight across the MVP formations. */
const REFERENCE_WEIGHT = Object.fromEntries(
  RECIPE_NAMES.map((name) => {
    const mvp = formationsConfig.formations.filter((f) => f.mvp);
    const total = mvp.reduce(
      (sum, f) => sum + slotWeights(f, RECIPES[name]).reduce((s, w) => s + w, 0),
      0,
    );
    return [name, total / mvp.length];
  }),
) as Record<RecipeName, number>;

const MIX_VECTORS = Object.fromEntries(
  RECIPE_NAMES.map((name) => {
    const entries = Object.entries(RECIPES[name].mix) as [RatingCode, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    return [name, entries.map(([code, w]) => [RATING_INDEX[code], w / total] as const)];
  }),
) as Record<RecipeName, (readonly [number, number])[]>;

const STP = RATING_INDEX.stp;

/** A player in a slot, as the team-rating calculation needs him. */
export interface SlotOccupant {
  /** Effective ratings (energy-adjusted), RATING_CODES order. */
  ratings: readonly number[];
  foot: Foot;
}

export interface FormationPlan {
  formation: Formation;
  weights: Record<RecipeName, number[]>;
}

const planCache = new Map<string, FormationPlan>();

export function formationPlan(formation: Formation): FormationPlan {
  let plan = planCache.get(formation.id);
  if (!plan) {
    plan = {
      formation,
      weights: Object.fromEntries(
        RECIPE_NAMES.map((name) => [name, slotWeights(formation, RECIPES[name])]),
      ) as Record<RecipeName, number[]>,
    };
    planCache.set(formation.id, plan);
  }
  return plan;
}

function mixQuality(ratings: readonly number[], name: RecipeName): number {
  let q = 0;
  for (const [index, weight] of MIX_VECTORS[name]) q += (ratings[index] as number) * weight;
  return q;
}

function slotPenalty(slot: FormationSlot, foot: Foot): number {
  return wrongFootPenalty(slot.position, slot.side, foot);
}

/** Raw recipe values before scaling, formation effect and sliders (for fitting RATING_SCALE). */
export function rawRecipeQualities(
  plan: FormationPlan,
  slots: readonly (SlotOccupant | null)[],
): Record<RecipeName, number> {
  const out = {} as Record<RecipeName, number>;
  for (const name of RECIPE_NAMES) {
    const weights = plan.weights[name];
    let sum = 0;
    let weightPresent = 0;
    let weightTotal = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (w === 0) continue;
      weightTotal += w;
      const occupant = slots[i];
      if (!occupant) continue;
      const slot = plan.formation.slots[i] as FormationSlot;
      sum += w * (mixQuality(occupant.ratings, name) - slotPenalty(slot, occupant.foot));
      weightPresent += w;
    }
    // An empty slot counts at half the quality of the players present.
    const mean = weightPresent > 0 ? sum / weightPresent : 0;
    out[name] =
      weightTotal > 0 ? (sum + 0.5 * mean * (weightTotal - weightPresent)) / weightTotal : 0;
  }
  return out;
}

const scaled = (raw: number, name: RecipeName | "setPieces") =>
  (raw - RATING_SCALE[name].offset) / RATING_SCALE[name].scale;

/**
 * Team ratings for the players in `slots` (null = empty, e.g. after a red card).
 * `setPieceTaker` is the designated taker's effective ratings.
 */
export function computeTeamRatings(
  plan: FormationPlan,
  slots: readonly (SlotOccupant | null)[],
  setPieceTaker: readonly number[] | null,
  sliders: SliderSettings,
  c: Coefficients,
): TeamRatings {
  const out = {} as TeamRatings;
  const raw = rawRecipeQualities(plan, slots);
  for (const name of RECIPE_NAMES) {
    const weightTotal = plan.weights[name].reduce((sum, w) => sum + w, 0);
    const formationEffect = FORMATION_SCALE * (weightTotal / REFERENCE_WEIGHT[name] - 1);
    out[name] = scaled(raw[name], name) + formationEffect;
  }

  const gkIndex = plan.formation.slots.findIndex((s) => s.position === "GK");
  const keeper = slots[gkIndex];
  out.goalkeeping = keeper ? rawPositionOvr(keeper.ratings, "GK") : 20;
  out.setPieces = scaled(setPieceTaker ? (setPieceTaker[STP] as number) : 40, "setPieces");

  out.attack += c.sliders.mentalityAttack * sliders.mentality;
  out.defence -= c.sliders.mentalityDefence * sliders.mentality;
  out.pressing += c.sliders.pressingRating * sliders.pressing;
  out.passing -= c.sliders.directnessPassing * sliders.directness;
  return out;
}

/**
 * Team OVR (SPEC §8.2): a 0–100 summary of the seven ratings. The spec's version is a
 * regression of the ratings onto goal difference; `pnpm calibrate` prints that fit, and
 * its weights replace these hand-set placeholders before Team OVR is first shown (M5).
 */
export const TEAM_OVR_WEIGHTS: Record<keyof TeamRatings, number> = {
  passing: 0.18,
  attack: 0.22,
  pressing: 0.12,
  defence: 0.22,
  aerial: 0.08,
  setPieces: 0.03,
  goalkeeping: 0.15,
};

export function teamOvr(ratings: TeamRatings, weights = TEAM_OVR_WEIGHTS): number {
  let sum = 0;
  let total = 0;
  for (const key of Object.keys(weights) as (keyof TeamRatings)[]) {
    sum += weights[key] * ratings[key];
    total += weights[key];
  }
  return Math.round(Math.min(100, Math.max(0, sum / total)));
}

/** Effective ratings at a given energy (0–1): physical drop most, others half as much. */
export function effectiveRatings(
  ratings: readonly number[],
  energy: number,
  c: Coefficients,
): number[] {
  const tired = 1 - Math.min(1, Math.max(0, energy));
  return ratings.map((value, i) => {
    const group = GROUP_OF[i];
    if (group === "fixed") return value;
    const loss = group === "physical" ? c.energy.physicalLoss : c.energy.otherLoss;
    return value * (1 - loss * tired);
  });
}

const GROUP_OF = Object.keys(RATING_INDEX).map(
  (code) => ratingsConfig.ageCurveGroupOf[code as RatingCode],
);
