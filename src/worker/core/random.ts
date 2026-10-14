/**
 * Seeded random number generator for all game logic (CLAUDE.md: never Math.random).
 *
 * Generator: sfc32 ("small fast counting", four 32-bit words). Seeds are strings,
 * hashed to 128 bits. The state is the seed plus four integers, so it can be saved
 * (the meta store, a paused match) and restored to continue the exact same sequence.
 *
 * Streams: fork(label) derives an independent generator from this generator's seed
 * and the label, without consuming any of this generator's numbers. Give each purpose
 * its own label (e.g. `match:${fixtureId}`), so simulating or watching one match never
 * shifts the randomness of anything else. Labels must be unique per purpose: forking
 * the same label twice gives the same stream twice.
 */

type Words = [number, number, number, number];

export interface RandomState {
  readonly seed: string;
  /** The four sfc32 state words, as unsigned 32-bit integers. */
  readonly words: readonly [number, number, number, number];
}

/** sfc32 warm-up rounds after seeding, so similar seeds diverge immediately. */
const WARM_UP_ROUNDS = 12;
const TWO_POW_32 = 4294967296;

export class Random {
  readonly seed: string;
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(seed: string, words: readonly [number, number, number, number]) {
    this.seed = seed;
    this.a = words[0] | 0;
    this.b = words[1] | 0;
    this.c = words[2] | 0;
    this.d = words[3] | 0;
  }

  static fromSeed(seed: string | number): Random {
    const text = String(seed);
    const rng = new Random(text, hash128(text));
    for (let i = 0; i < WARM_UP_ROUNDS; i++) rng.nextUint32();
    return rng;
  }

  static fromState(state: RandomState): Random {
    for (const word of state.words) {
      if (!Number.isInteger(word) || word < 0 || word >= TWO_POW_32) {
        throw new RangeError(`Invalid RNG state word: ${word}`);
      }
    }
    return new Random(state.seed, state.words);
  }

  getState(): RandomState {
    return { seed: this.seed, words: [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0] };
  }

  /** An independent generator for one purpose, derived from this seed and `label`. */
  fork(label: string): Random {
    return Random.fromSeed(`${this.seed}/${label}`);
  }

  /** Uniform integer in [0, 2^32). One sfc32 step. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /**
   * Uniform integer in [min, max], both inclusive. Bias is at most range / 2^32,
   * which is negligible for game-sized ranges.
   */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}) needs integers with min <= max`);
    }
    const range = max - min + 1;
    if (range > TWO_POW_32) throw new RangeError(`int(${min}, ${max}) range is too large`);
    return min + Math.floor(this.next() * range);
  }

  /** Uniform float in [min, max). */
  real(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** true with probability p. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Normally distributed value (Box–Muller). Uses two uniforms per call. */
  normal(mean = 0, sd = 1): number {
    const u1 = 1 - this.next(); // (0, 1], so log(u1) is finite
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** One element, uniformly chosen. */
  choice<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("choice() needs at least one item");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** An index chosen with probability proportional to its weight. Zero weights are never chosen. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) throw new RangeError(`Invalid weight: ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError("weightedIndex() needs a positive total weight");

    let remaining = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      remaining -= weights[i] as number;
      if (remaining < 0) return i;
    }
    // Floating-point leftovers can skip past the end: return the last positive weight.
    for (let i = weights.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return i;
    }
    throw new Error("unreachable: total weight was positive");
  }

  /** One item, chosen with probability proportional to weightOf(item). */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    return items[this.weightedIndex(items.map(weightOf))] as T;
  }

  /** A new array with the same items in random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const swap = out[i] as T;
      out[i] = out[j] as T;
      out[j] = swap;
    }
    return out;
  }
}

/**
 * 128-bit string hash for seeding: four 32-bit FNV-1a-style lanes with different
 * offsets and multipliers, cross-mixed and finished with the MurmurHash3 avalanche
 * step. Not cryptographic; it only has to send similar labels ("match:1", "match:2")
 * to unrelated generator states.
 */
function hash128(text: string): Words {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ unit, 0x01000193);
    h2 = Math.imul(h2 ^ unit, 0x5bd1e995);
    h3 = Math.imul(h3 ^ unit, 0x27d4eb2f);
    h4 = Math.imul(h4 ^ unit, 0x165667b1);
  }
  h1 = avalanche(h1 ^ Math.imul(h2, 0x2c1b3c6d) ^ text.length);
  h2 = avalanche(h2 ^ Math.imul(h3, 0x297a2d39) ^ h1);
  h3 = avalanche(h3 ^ Math.imul(h4, 0x6ad4c2ef) ^ h2);
  h4 = avalanche(h4 ^ Math.imul(h1, 0x9e3779b1) ^ h3);
  return [h1, h2, h3, h4];
}

/** MurmurHash3 fmix32: every input bit affects every output bit. */
function avalanche(value: number): number {
  let h = value;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
