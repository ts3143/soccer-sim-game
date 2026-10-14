/**
 * Calibration harness: `pnpm calibrate`.
 *
 * From M2 on, this sims many matches and seasons headlessly in Node and prints a
 * pass/fail report against data/config/calibration_targets.json (neutral engine
 * first, then each league against target × its style modifier).
 *
 * M0 stub: proves the headless path works. Node loads the targets and runs the
 * game core's seeded RNG with no browser, deterministically.
 */
import { readFileSync } from "node:fs";
import { Random } from "../../src/worker/core/random";

interface CalibrationTargets {
  perMatch: Record<string, unknown>;
  perSeason: Record<string, unknown>;
  development: Record<string, unknown>;
}

const targetsUrl = new URL("../../data/config/calibration_targets.json", import.meta.url);
const targets = JSON.parse(readFileSync(targetsUrl, "utf8")) as CalibrationTargets;

const rolls = (seed: string) => {
  const rng = Random.fromSeed(seed);
  return Array.from({ length: 5 }, () => rng.int(1, 100));
};
const first = rolls("calibrate");
const second = rolls("calibrate");
const deterministic = first.join() === second.join();

console.log("Soccer Sim Game: calibration harness (M0 stub)");
console.log(
  `Loaded calibration_targets.json: ${Object.keys(targets.perMatch).length} per-match, ` +
    `${Object.keys(targets.perSeason).length} per-season, ` +
    `${Object.keys(targets.development).length} development targets.`,
);
console.log(`Seeded RNG in Node: seed "calibrate" -> ${first.join(", ")}`);
console.log(deterministic ? "PASS determinism check" : "FAIL determinism check");
console.log("0 calibration checks implemented yet: the match engine arrives in M2.");

process.exitCode = deterministic ? 0 : 1;
