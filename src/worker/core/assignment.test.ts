import { describe, expect, it } from "vitest";
import { maximizeAssignment } from "./assignment";
import { Random } from "./random";

/** Brute force over all injective row→column maps (small inputs only). */
function bruteForceBest(scores: number[][]): number {
  const rows = scores.length;
  const cols = (scores[0] ?? []).length;
  let best = -Infinity;
  const used = new Array<boolean>(cols).fill(false);
  const visit = (row: number, total: number) => {
    if (row === rows) {
      best = Math.max(best, total);
      return;
    }
    for (let col = 0; col < cols; col++) {
      if (used[col]) continue;
      used[col] = true;
      visit(row + 1, total + ((scores[row] as number[])[col] as number));
      used[col] = false;
    }
  };
  visit(0, 0);
  return best;
}

const total = (scores: number[][], cols: number[]) =>
  cols.reduce((s, col, row) => s + ((scores[row] as number[])[col] as number), 0);

describe("maximizeAssignment", () => {
  it("finds the optimum on a known case", () => {
    const scores = [
      [7, 5, 1],
      [6, 9, 2],
      [3, 8, 4],
    ];
    const cols = maximizeAssignment(scores);
    expect(total(scores, cols)).toBe(20); // 7 + 9 + 4
  });

  it("matches brute force on random rectangular inputs", () => {
    const rng = Random.fromSeed("assignment");
    for (let trial = 0; trial < 60; trial++) {
      const rows = rng.int(1, 5);
      const cols = rng.int(rows, 7);
      const scores = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => rng.int(30, 90)),
      );
      const picked = maximizeAssignment(scores);
      expect(new Set(picked).size).toBe(rows);
      expect(total(scores, picked)).toBe(bruteForceBest(scores));
    }
  });

  it("handles a full squad quickly and rejects too few columns", () => {
    const rng = Random.fromSeed("big");
    const scores = Array.from({ length: 11 }, () =>
      Array.from({ length: 30 }, () => rng.int(40, 80)),
    );
    const picked = maximizeAssignment(scores);
    expect(new Set(picked).size).toBe(11);
    expect(() => maximizeAssignment([[1], [2]])).toThrow();
  });
});
