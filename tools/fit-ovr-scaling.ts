/**
 * Fits the fixed per-position OVR scaling constants (SPEC §4.3) once and writes them
 * into data/config/ratings_positions.json → ovrScaling. Run only as a deliberate refit:
 *
 *   pnpm exec tsx tools/fit-ovr-scaling.ts [--write]
 *
 * Method: generate natural specialists of known quality q at each position (the
 * generator's raw position profile, before it targets an exact OVR) and fit
 * q = offset + scale × weightedMean by least squares. The result: a specialist of
 * quality q rates ≈ q at his position, so OVRs are comparable across positions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { POSITIONS } from "../src/common/config/ratings";
import { weightedMean } from "../src/worker/core/ovr";
import { Random } from "../src/worker/core/random";
import { generateRatings } from "../src/worker/generate/player";

const SAMPLES = 6000;
const HEIGHT_CM = {
  GK: 190,
  CB: 188,
  FB: 178,
  WB: 177,
  DM: 182,
  CM: 179,
  WM: 177,
  AM: 175,
  W: 175,
  ST: 183,
};

const rng = Random.fromSeed("fit-ovr-scaling/v1");
const fitted: Record<string, { scale: number; offset: number; residualSd: number }> = {};

for (const position of POSITIONS) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const quality = rng.real(35, 85);
    const age = rng.int(20, 32);
    const height = rng.normal(HEIGHT_CM[position], position === "GK" ? 4.5 : 5.5);
    xs.push(weightedMean(generateRatings(rng, position, quality, age, height, false), position));
    ys.push(quality);
  }
  const mx = xs.reduce((s, x) => s + x, 0) / SAMPLES;
  const my = ys.reduce((s, y) => s + y, 0) / SAMPLES;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < SAMPLES; i++) {
    sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
    sxx += ((xs[i] as number) - mx) ** 2;
  }
  const scale = sxy / sxx;
  const offset = my - scale * mx;
  const residualSd = Math.sqrt(
    xs.reduce((s, x, i) => s + ((ys[i] as number) - (offset + scale * x)) ** 2, 0) / SAMPLES,
  );
  fitted[position] = {
    scale: Math.round(scale * 10000) / 10000,
    offset: Math.round(offset * 100) / 100,
    residualSd,
  };
  console.log(
    `${position.padEnd(2)}  scale ${fitted[position].scale.toFixed(4)}  offset ${fitted[
      position
    ].offset
      .toFixed(2)
      .padStart(6)}  (residual sd ${residualSd.toFixed(2)})`,
  );
}

if (process.argv.includes("--write")) {
  const url = new URL("../data/config/ratings_positions.json", import.meta.url);
  let text = readFileSync(url, "utf8");
  for (const [position, { scale, offset }] of Object.entries(fitted)) {
    const line = new RegExp(`("${position}": \\{ "scale": )[-\\d.]+(, "offset": )[-\\d.]+( \\})`);
    if (!line.test(text)) throw new Error(`ovrScaling line for ${position} not found`);
    text = text.replace(line, `$1${scale}$2${offset}$3`);
  }
  text = text.replace('"status": "unfitted"', '"status": "fitted"');
  text = text.replace("Identity values until fitted.", "Fitted with tools/fit-ovr-scaling.ts.");
  writeFileSync(url, text);
  console.log("Wrote ovrScaling to data/config/ratings_positions.json");
}
