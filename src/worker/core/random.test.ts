import { describe, expect, it } from "vitest";
import { Random, type RandomState } from "./random";

const take = (rng: Random, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe("Random: determinism", () => {
  it("gives the same sequence for the same seed", () => {
    expect(take(Random.fromSeed("league-1"), 1000)).toEqual(
      take(Random.fromSeed("league-1"), 1000),
    );
  });

  it("gives different sequences for different seeds", () => {
    expect(take(Random.fromSeed("league-1"), 20)).not.toEqual(
      take(Random.fromSeed("league-2"), 20),
    );
  });

  it("treats numeric and string seeds alike", () => {
    expect(take(Random.fromSeed(42), 10)).toEqual(take(Random.fromSeed("42"), 10));
  });

  it("keeps the algorithm stable (saved leagues depend on it)", () => {
    const rng = Random.fromSeed("soccer-sim-game");
    expect(Array.from({ length: 5 }, () => rng.nextUint32())).toEqual([
      454873192, 1021711894, 3409234363, 2308340614, 208042776,
    ]);
    const fork = Random.fromSeed("soccer-sim-game").fork("match:1");
    expect(Array.from({ length: 3 }, () => fork.nextUint32())).toEqual([
      196081732, 58432392, 1583263119,
    ]);
  });
});

describe("Random: saving and restoring state", () => {
  it("resumes the exact sequence from a saved state", () => {
    const original = Random.fromSeed("resume");
    take(original, 50);
    const saved = original.getState();
    const expected = take(original, 50);
    expect(take(Random.fromState(saved), 50)).toEqual(expected);
  });

  it("survives a JSON round trip (as when stored)", () => {
    const original = Random.fromSeed("json");
    take(original, 7);
    const restored = Random.fromState(
      JSON.parse(JSON.stringify(original.getState())) as RandomState,
    );
    expect(take(restored, 20)).toEqual(take(original, 20));
    expect(restored.seed).toBe("json");
  });

  it("stores state words as unsigned 32-bit integers", () => {
    const rng = Random.fromSeed("words");
    take(rng, 100);
    for (const word of rng.getState().words) {
      expect(Number.isInteger(word) && word >= 0 && word < 2 ** 32).toBe(true);
    }
  });

  it("rejects corrupt state", () => {
    expect(() => Random.fromState({ seed: "x", words: [1, 2, 3, -1] })).toThrow(RangeError);
    expect(() => Random.fromState({ seed: "x", words: [1, 2, 3, 0.5] })).toThrow(RangeError);
  });
});

describe("Random: forks", () => {
  it("are deterministic and independent of how far the parent has run", () => {
    const fresh = Random.fromSeed("league").fork("match:1");
    const parent = Random.fromSeed("league");
    take(parent, 500);
    expect(take(parent.fork("match:1"), 100)).toEqual(take(fresh, 100));
  });

  it("do not consume the parent's numbers", () => {
    const a = Random.fromSeed("league");
    const b = Random.fromSeed("league");
    a.fork("match:1");
    a.fork("match:2");
    expect(take(a, 20)).toEqual(take(b, 20));
  });

  it("give different streams for different labels and nest by path", () => {
    const league = Random.fromSeed("league");
    const firsts = new Set(
      Array.from({ length: 1000 }, (_, i) => league.fork(`match:${i}`).nextUint32()),
    );
    expect(firsts.size).toBe(1000);
    expect(take(league.fork("season:2027").fork("youth"), 5)).toEqual(
      take(Random.fromSeed("league/season:2027/youth"), 5),
    );
  });
});

describe("Random: helpers", () => {
  const rng = Random.fromSeed("helpers");

  it("next() stays in [0, 1) with a uniform mean", () => {
    const values = take(rng, 100_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.495);
    expect(mean).toBeLessThan(0.505);
  });

  it("int() is inclusive at both ends and roughly uniform", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 60_000; i++) {
      const face = rng.int(1, 6);
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const count of counts.values()) {
      expect(count / 60_000).toBeGreaterThan(0.156);
      expect(count / 60_000).toBeLessThan(0.177);
    }
    expect(rng.int(7, 7)).toBe(7);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.int(0.5, 4)).toThrow(RangeError);
  });

  it("real() stays in [min, max)", () => {
    for (let i = 0; i < 10_000; i++) {
      const v = rng.real(-2, 3);
      expect(v >= -2 && v < 3).toBe(true);
    }
  });

  it("bool() respects the probability", () => {
    expect(Array.from({ length: 1000 }, () => rng.bool(0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 1000 }, () => rng.bool(1)).every(Boolean)).toBe(true);
    const share =
      Array.from({ length: 50_000 }, () => rng.bool(0.3)).filter(Boolean).length / 50_000;
    expect(share).toBeGreaterThan(0.29);
    expect(share).toBeLessThan(0.31);
  });

  it("normal() has the requested mean and spread", () => {
    const values = Array.from({ length: 50_000 }, () => rng.normal(50, 10));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    expect(mean).toBeGreaterThan(49.8);
    expect(mean).toBeLessThan(50.2);
    expect(sd).toBeGreaterThan(9.8);
    expect(sd).toBeLessThan(10.2);
  });

  it("weightedIndex() never picks zero weights and follows proportions", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) {
      const index = rng.weightedIndex([1, 0, 3, 0]);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect(counts[3]).toBe(0);
    expect((counts[2] ?? 0) / 40_000).toBeGreaterThan(0.74);
    expect((counts[2] ?? 0) / 40_000).toBeLessThan(0.76);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
  });

  it("weighted() and choice() return items from the list", () => {
    const items = ["GK", "CB", "ST"];
    expect(items).toContain(rng.choice(items));
    expect(rng.weighted(items, (p) => (p === "ST" ? 1 : 0))).toBe("ST");
    expect(() => rng.choice([])).toThrow(RangeError);
  });

  it("shuffle() returns a permutation without touching the input", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const shuffled = rng.shuffle(input);
    expect(shuffled).not.toEqual(input);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(Random.fromSeed("s").shuffle(input)).toEqual(Random.fromSeed("s").shuffle(input));
  });
});
