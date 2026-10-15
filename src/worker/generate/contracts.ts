/**
 * Opening contracts and wages (MILESTONES M1): each club's wage bill is a seeded share
 * of its revenue anchor between 50% and 65% (SPEC §6.3 default), split across the
 * seniors by quality and age. No transfer amortisation exists at the start, so the
 * squad cost ratio equals the wage ratio. Academy players have no pro contract yet.
 */
import { addYears } from "../../common/dates";
import type { Player } from "../../common/schema";
import type { Random } from "../core/random";

export const STARTING_SQUAD_COST = { min: 0.5, max: 0.65 };
/** Each +6 OVR above the XI level roughly doubles a wage. */
export const WAGE_STEEPNESS = 0.115;
const MIN_WAGE = 30_000;

export function wageAgeFactor(age: number): number {
  if (age <= 20) return 0.45;
  if (age <= 23) return 0.75;
  if (age <= 30) return 1;
  if (age <= 33) return 0.9;
  return 0.75;
}

/** Rounds a wage to a believable figure. */
export function roundWage(wage: number): number {
  const step = wage >= 1_000_000 ? 10_000 : wage >= 100_000 ? 5_000 : 1_000;
  return Math.max(MIN_WAGE, Math.round(wage / step) * step);
}

/** Contract years left (weights for 1..5 years), by age band. */
function contractYears(rng: Random, age: number): number {
  const weights =
    age <= 23 ? [8, 15, 25, 27, 25] : age <= 29 ? [10, 22, 28, 24, 16] : [30, 35, 25, 10, 0];
  return rng.weightedIndex(weights) + 1;
}

export function assignContracts(
  rng: Random,
  seniors: Player[],
  ages: Map<number, number>,
  strength: number,
  revenue: number,
  seasonStart: string,
): { squadCostRatio: number } {
  const target = rng.real(STARTING_SQUAD_COST.min, STARTING_SQUAD_COST.max);
  const bill = target * revenue;
  const weights = seniors.map(
    (p) => Math.exp(WAGE_STEEPNESS * (p.ovr - strength)) * wageAgeFactor(ages.get(p.pid) ?? 27),
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let totalWages = 0;
  seniors.forEach((player, i) => {
    const wage = roundWage((bill * (weights[i] as number)) / totalWeight);
    totalWages += wage;
    const years = contractYears(rng, ages.get(player.pid) ?? 27);
    // Contracts end on 30 June: one year left means it expires at the end of this season.
    player.contract = { wage, expires: addYears(seasonStart, years).slice(0, 4) + "-06-30" };
  });
  return { squadCostRatio: totalWages / revenue };
}
