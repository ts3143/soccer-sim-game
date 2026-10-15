/**
 * Season-loop calibration (M3), run by `pnpm calibrate --world [--seasons 20] [--worlds 3]
 * [--seed X] [--check]`.
 *
 * Plays W generated worlds for S seasons each (in parallel processes) with the real
 * season loop, then checks data/config/calibration_targets.json:
 * - perSeason: champion and bottom points, top scorer and assists (ENG1), injured per
 *   squad, injury lengths, parity, top clubs' minutes share;
 * - development: growth of well-played and benched 18–21s, decline from 33, retirement
 *   ages, how often young players beat their displayed POT, wonderkids per league;
 * - worldStability20Seasons: player count drift, distinct ENG1 champions.
 * Gated in M3 (T, 2026-10-14): all of the above. Reported only: promoted clubs' survival
 * and the finance checks (gated in M4).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import type { WorldRun } from "./world";

interface Band {
  target: number;
  tol: [number, number];
}
type Targets = Record<string, Record<string, Band | string>>;

const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const SEASONS = Number(option("--seasons", "20"));
const WORLDS = Number(option("--worlds", "3"));
const SEED = option("--seed", "calibrate");
const CHECK = args.includes("--check");
const JOBS = Math.max(
  1,
  Math.min(WORLDS, Number(option("--jobs", String(availableParallelism())))),
);

const targets = JSON.parse(
  readFileSync(new URL("../../data/config/calibration_targets.json", import.meta.url), "utf8"),
) as Targets;
const band = (group: string, key: string): Band => {
  const value = targets[group]?.[key];
  if (typeof value !== "object") throw new Error(`No band for ${group}.${key}`);
  return value;
};

/** Runs one world in a child process and returns its WorldRun. */
function runWorld(seed: string): Promise<WorldRun> {
  const script = fileURLToPath(new URL("./world-run.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, seed, String(SEASONS)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`World ${seed} failed (exit ${code})`));
      else resolve(JSON.parse(out) as WorldRun);
    });
  });
}

async function runAll(): Promise<WorldRun[]> {
  const seeds = Array.from({ length: WORLDS }, (_, w) => `${SEED}-w${w}`);
  const results: WorldRun[] = [];
  let next = 0;
  const worker = async () => {
    while (next < seeds.length) {
      const seed = seeds[next++] as string;
      results.push(await runWorld(seed));
      process.stderr.write(`  world ${seed}: ${SEASONS} seasons done\n`);
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));
  return results.sort((a, b) => a.seed.localeCompare(b.seed));
}

const started = performance.now();
console.log(`Soccer Sim Game: season-loop calibration (seed "${SEED}")`);
console.log(`${WORLDS} worlds × ${SEASONS} seasons, ${JOBS} at a time\n`);
const runs = await runAll();
const wall = (performance.now() - started) / 1000;

let failures = 0;
const fmt = (x: number) => (Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(2));
const row = (name: string, value: string, target: string, gated: boolean, pass: boolean) => {
  if (gated && !pass) failures++;
  const verdict = gated ? (pass ? "PASS" : "FAIL") : pass ? "ok" : "off";
  console.log(`  ${name.padEnd(34)} ${value.padStart(9)}   ${target.padEnd(30)} ${verdict}`);
};
const inBand = (name: string, value: number, b: Band, gated = true) =>
  row(
    name,
    fmt(value),
    `${fmt(b.target)} (${fmt(b.tol[0])}-${fmt(b.tol[1])})`,
    gated,
    value >= b.tol[0] && value <= b.tol[1],
  );

const seasons = runs.flatMap((r) => r.seasons);
const avg = (key: string) => seasons.reduce((s, m) => s + (m[key] ?? 0), 0) / seasons.length;

console.log("Per season (averages over every season of every world)");
for (const key of [
  "championPointsENG1",
  "bottomPointsENG1",
  "topScorerGoals",
  "topAssists",
  "injuredPerSquadAtOnce",
  "top6LoseToBottom6Pct",
  "topClubStarterMinutesShare",
]) {
  inBand(key, avg(key), band("perSeason", key));
}
const injuryLengths = `${(avg("injuryOneToThreeWeeks") * 100).toFixed(0)}% 1-3 wk, ${(avg("injuryFourWeeksPlus") * 100).toFixed(0)}% 4+ wk, ${(avg("injurySeasonEnding") * 100).toFixed(1)}% 120+ d`;
row(
  "typicalInjuryWeeks",
  "",
  injuryLengths,
  true,
  avg("injuryOneToThreeWeeks") >= 0.5 &&
    avg("injuryFourWeeksPlus") >= 0.05 &&
    avg("injuryFourWeeksPlus") <= 0.2 &&
    avg("injurySeasonEnding") <= 0.05,
);

console.log("\nDevelopment");
for (const key of [
  "wellPlayed18to21OvrGainPerYear",
  "benched18to21OvrGainPerYear",
  "age33plusOvrLossPerYear",
  "wonderkidsPerLeaguePerSeason",
]) {
  inBand(key, avg(key), band("development", key));
}
const checked = runs.reduce((s, r) => s + r.potChecked, 0);
const exceeded = runs.reduce((s, r) => s + r.potExceeded, 0);
// Young players need ~10 seasons to reach their peak; shorter runs only report it.
inBand(
  "exceedDisplayedPotPct",
  exceeded / Math.max(1, checked),
  band("development", "exceedDisplayedPotPct"),
  SEASONS >= 12,
);
const retirements = runs.flatMap((r) => r.retirements);
const share3337 =
  retirements.filter((r) => r.age >= 33 && r.age < 38).length / Math.max(1, retirements.length);
const meanAge = (xs: { age: number }[]) =>
  xs.reduce((s, r) => s + r.age, 0) / Math.max(1, xs.length);
const gkAge = meanAge(retirements.filter((r) => r.gk));
const outfieldAge = meanAge(retirements.filter((r) => !r.gk));
row(
  "retirementAge",
  "",
  `${(share3337 * 100).toFixed(0)}% at 33-37; GK ${gkAge.toFixed(1)} v ${outfieldAge.toFixed(1)}`,
  true,
  share3337 >= 0.5 && gkAge > outfieldAge,
);

console.log("\nWorld stability");
const drift = Math.max(
  ...runs.flatMap((r) => r.activeAfter.map((n) => Math.abs(n / r.activeAtStart - 1))),
);
row(
  "playerCountDrift (vs start)",
  `${(drift * 100).toFixed(1)}%`,
  "within ±10% of the start",
  true,
  drift <= 0.1,
);
const settledFrom = Math.min(4, SEASONS - 1);
const settled = Math.max(
  ...runs.flatMap((r) => {
    const base = r.activeAfter[settledFrom - 1] ?? r.activeAtStart;
    return r.activeAfter.slice(settledFrom).map((n) => Math.abs(n / base - 1));
  }),
);
row(
  `  after season ${settledFrom} (information)`,
  `${(settled * 100).toFixed(1)}%`,
  "within ±10%",
  false,
  settled <= 0.1,
);
const distinct = Math.min(...runs.map((r) => new Set(r.championsENG1).size));
row(
  "differentChampionsENG1 (fewest)",
  String(distinct),
  `at least 3 in ${SEASONS} seasons`,
  SEASONS >= 20,
  distinct >= 3,
);
const survived = runs.reduce((s, r) => s + r.promotedSurvived, 0);
const promoted = runs.reduce((s, r) => s + r.promotedChecked, 0);
row(
  "promotedClubsSurvivalRate (M4)",
  `${((survived / Math.max(1, promoted)) * 100).toFixed(0)}%`,
  "roughly 35-60% (gated in M4)",
  false,
  survived / Math.max(1, promoted) >= 0.35 && survived / Math.max(1, promoted) <= 0.6,
);

console.log("\nFor information");
const info = (label: string, value: string) => console.log(`  ${label.padEnd(34)} ${value}`);
info("parity ENG2 / GER1", `${fmt(avg("parityENG2"))} / ${fmt(avg("parityGER1"))}`);
info("injuries per team per match", fmt(avg("injuriesPerTeamMatch")));
info("training share of injuries", fmt(avg("trainingInjuryShare")));
info("youth intake per season", avg("youthIntake").toFixed(0));
info(
  "active players (start → end, per world)",
  runs.map((r) => `${r.activeAtStart} → ${r.activeAfter.at(-1)}`).join(", "),
);
info(
  "seconds per season (per process)",
  fmt(runs.reduce((s, r) => s + r.seconds, 0) / (runs.length * SEASONS)),
);
info("wall time", `${wall.toFixed(0)} s`);

console.log(failures === 0 ? "\nAll gated checks pass." : `\n${failures} gated check(s) failed.`);
if (CHECK && failures > 0) process.exitCode = 1;
