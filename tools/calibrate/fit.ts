/**
 * Least-squares fits for the harness: Team OVR (goal difference regressed on the seven
 * team-rating differences, SPEC §8.2) and per-position rating centring.
 */
import type { Position } from "../../src/common/config/ratings";
import { COEFFICIENTS } from "../../src/worker/engine/coefficients";
import { rawMatchScore } from "../../src/worker/engine/ratings";
import type { TeamRatings } from "../../src/worker/engine/teamRatings";
import type { SimulatedMatch } from "./runs";

export const RATING_KEYS: (keyof TeamRatings)[] = [
  "passing",
  "attack",
  "pressing",
  "defence",
  "aerial",
  "setPieces",
  "goalkeeping",
];

/** Solves the normal equations (XᵀX)β = Xᵀy by Gaussian elimination with pivoting. */
function leastSquares(rows: number[][], y: number[]): number[] {
  const k = (rows[0] as number[]).length;
  const a = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  rows.forEach((x, n) => {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) (a[i] as number[])[j]! += (x[i] as number) * (x[j] as number);
      (a[i] as number[])[k]! += (x[i] as number) * (y[n] as number);
    }
  });
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (
        Math.abs((a[r] as number[])[col] as number) >
        Math.abs((a[pivot] as number[])[col] as number)
      )
        pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
    const p = (a[col] as number[])[col] as number;
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = ((a[r] as number[])[col] as number) / p;
      for (let j = col; j <= k; j++)
        (a[r] as number[])[j]! -= f * ((a[col] as number[])[j] as number);
    }
  }
  return a.map((row, i) => (row[k] as number) / (row[i] as number));
}

export interface TeamOvrFit {
  intercept: number;
  coefficients: Record<keyof TeamRatings, number>;
  /** Coefficients rescaled to sum to 1 (weights for a 0–100 Team OVR). */
  weights: Record<keyof TeamRatings, number>;
  r2: number;
}

export function fitTeamOvr(matches: readonly SimulatedMatch[]): TeamOvrFit {
  const rows = matches.map((m) => [
    1,
    ...RATING_KEYS.map((key) => m.ratings[0][key] - m.ratings[1][key]),
  ]);
  const y = matches.map((m) => m.result.homeGoals - m.result.awayGoals);
  const beta = leastSquares(rows, y);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  rows.forEach((x, i) => {
    const prediction = x.reduce((s, v, j) => s + v * (beta[j] as number), 0);
    ssRes += ((y[i] as number) - prediction) ** 2;
    ssTot += ((y[i] as number) - mean) ** 2;
  });
  const coefficients = Object.fromEntries(
    RATING_KEYS.map((key, i) => [key, beta[i + 1] as number]),
  ) as Record<keyof TeamRatings, number>;
  const positive = RATING_KEYS.reduce((s, key) => s + Math.max(0, coefficients[key]), 0);
  const weights = Object.fromEntries(
    RATING_KEYS.map((key) => [key, Math.max(0, coefficients[key]) / positive]),
  ) as Record<keyof TeamRatings, number>;
  return { intercept: beta[0] as number, coefficients, weights, r2: 1 - ssRes / ssTot };
}

/** Mean raw rating score by position for players with 60+ minutes (the centring values). */
export function ratingCentring(
  matches: readonly SimulatedMatch[],
): Partial<Record<Position, number>> {
  const sums = new Map<Position, { total: number; n: number }>();
  for (const { result } of matches) {
    for (const p of result.players) {
      if (p.minutes < 60) continue;
      const own = p.side === 0 ? result.homeGoals : result.awayGoals;
      const opp = p.side === 0 ? result.awayGoals : result.homeGoals;
      const raw = rawMatchScore(p, own > opp ? "win" : own < opp ? "loss" : "draw", COEFFICIENTS);
      const entry = sums.get(p.position) ?? { total: 0, n: 0 };
      entry.total += raw;
      entry.n++;
      sums.set(p.position, entry);
    }
  }
  return Object.fromEntries([...sums].map(([position, { total, n }]) => [position, total / n]));
}
