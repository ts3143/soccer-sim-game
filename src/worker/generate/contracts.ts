/**
 * Opening contracts and wages (MILESTONES M1, M4): each club's squad cost (wages plus
 * the yearly write-off of past transfer fees) is a seeded share of its revenue anchor
 * between 50% and 65% (SPEC §6.3 default). About 70% of it is wages, split across the
 * seniors by quality and age; the rest is notional past fees (T, 2026-10-16), spread over
 * each player's remaining contract years. Players 20 or under are taken as home-grown
 * and carry no fee. Academy players have no pro contract yet.
 */
import { addYears } from "../../common/dates";
import type { Player } from "../../common/schema";
import type { Random } from "../core/random";

export const STARTING_SQUAD_COST = { min: 0.5, max: 0.65 };
/** Share of the opening squad cost that is wages; the rest is past-fee amortisation. */
export const OPENING_WAGE_SHARE = 0.7;
/** Players this age or younger at the start carry no past fee (home-grown). */
const HOME_GROWN_MAX_AGE = 20;
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

/** An opening squad's bill: the season's wages, and past fees still being paid off. */
export interface OpeningBill {
  wages: number;
  fees: number;
}

/** Classic: the squad costs 50-65% of revenue, 70% of it wages (SPEC §6.4). */
export function revenueBill(rng: Random, revenue: number): OpeningBill {
  const bill = rng.real(STARTING_SQUAD_COST.min, STARTING_SQUAD_COST.max) * revenue;
  return { wages: OPENING_WAGE_SHARE * bill, fees: (1 - OPENING_WAGE_SHARE) * bill };
}

/**
 * Under a soft cap (SPEC §17.7): wages at a share of the club's cap, drawn from the
 * config's range; no past fees (no transfer market).
 */
export function capBill(
  rng: Random,
  cap: number,
  share: { min: number; max: number },
): OpeningBill {
  return { wages: rng.real(share.min, share.max) * cap, fees: 0 };
}

export function assignContracts(
  rng: Random,
  seniors: Player[],
  ages: Map<number, number>,
  strength: number,
  revenue: number,
  seasonStart: string,
  bill: OpeningBill,
): { squadCostRatio: number } {
  const weights = seniors.map(
    (p) => Math.exp(WAGE_STEEPNESS * (p.ovr - strength)) * wageAgeFactor(ages.get(p.pid) ?? 27),
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const feeWeights = seniors.map((p, i) =>
    (ages.get(p.pid) ?? 27) > HOME_GROWN_MAX_AGE ? (weights[i] as number) : 0,
  );
  const totalFeeWeight = feeWeights.reduce((s, w) => s + w, 0);
  let totalCost = 0;
  seniors.forEach((player, i) => {
    const wage = roundWage((bill.wages * (weights[i] as number)) / totalWeight);
    const years = contractYears(rng, ages.get(player.pid) ?? 27);
    // Contracts end on 30 June: one year left means it expires at the end of this season.
    player.contract = { wage, expires: addYears(seasonStart, years).slice(0, 4) + "-06-30" };
    const perYear =
      totalFeeWeight > 0 ? Math.round((bill.fees * (feeWeights[i] as number)) / totalFeeWeight) : 0;
    player.feeBalance = perYear > 0 ? { remaining: perYear * years, perYear } : null;
    totalCost += wage + perYear;
  });
  return { squadCostRatio: totalCost / revenue };
}
