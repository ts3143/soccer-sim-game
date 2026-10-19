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
 * Gated in M3 (T, 2026-10-14): all of the above except young regulars' growth. Gated
 * from M4 (chunk 8): young regulars' growth, promoted clubs' survival, negative cash,
 * squad cost ratios, wage and fee levels, the world's shape (mean OVR, 75+ share, peak
 * age; T 2026-10-15) and the two exploit checks, with bands from calibration_targets.json
 * (the M4 ones approved by T, 2026-10-19).
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
const OVERRIDES = option("--overrides", "");
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
      env: { ...process.env, ...(OVERRIDES ? { CALIBRATE_OVERRIDES: OVERRIDES } : {}) },
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
console.log(`${WORLDS} worlds × ${SEASONS} seasons, ${JOBS} at a time`);
if (OVERRIDES) console.log(`Coefficient overrides: ${OVERRIDES}`);
console.log("");
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
const firstLastPct = (key: string) =>
  `${((runs.reduce((s, r) => s + (r.seasons[0]?.[key] ?? 0), 0) / runs.length) * 100).toFixed(0)}% → ${((runs.reduce((s, r) => s + (r.seasons.at(-1)?.[key] ?? 0), 0) / runs.length) * 100).toFixed(0)}%`;
const firstLast = (key: string) =>
  `${fmt(runs.reduce((s, r) => s + (r.seasons[0]?.[key] ?? 0), 0) / runs.length)} → ${fmt(runs.reduce((s, r) => s + (r.seasons.at(-1)?.[key] ?? 0), 0) / runs.length)}`;

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
// Young regulars' growth is gated from M4, with transfers and loans (T, 2026-10-15).
inBand(
  "wellPlayed18to21OvrGainPerYear",
  avg("wellPlayed18to21OvrGainPerYear"),
  band("development", "wellPlayed18to21OvrGainPerYear"),
);
for (const key of [
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
  "promotedClubsSurvivalRate",
  `${((survived / Math.max(1, promoted)) * 100).toFixed(0)}%`,
  "roughly 35-60%",
  SEASONS >= 10,
  survived / Math.max(1, promoted) >= 0.35 && survived / Math.max(1, promoted) <= 0.6,
);

// ---------------------------------------------------------------------------
// M4: economy, market and world shape (MILESTONES M4 "Accept").
// Bands from calibration_targets.json worldStability20Seasons (the M4 ones approved by
// T, 2026-10-19).
const W = "worldStability20Seasons";
console.log("\nEconomy, market and world shape (M4)");
const perSeason = (key: string) => runs.flatMap((r) => r.seasons.map((m) => m[key] ?? 0));
const lastOf = (key: string) =>
  runs.reduce((s, r) => s + (r.seasons.at(-1)?.[key] ?? 0), 0) / runs.length;
const firstOf = (key: string) =>
  runs.reduce((s, r) => s + (r.seasons[0]?.[key] ?? 0), 0) / runs.length;
const pctText = (x: number) => `${(x * 100).toFixed(0)}%`;
const worstCash = Math.max(...perSeason("negativeCashShare"));
row(
  "clubsInNegativeCashShare (worst)",
  pctText(worstCash),
  "< 15% at any season end",
  true,
  worstCash < 0.15,
);
// Each season's value averaged over the worlds, so the check doesn't widen with more worlds.
const everySeason = (name: string, key: string, b: Band) => {
  const xs = Array.from({ length: SEASONS }, (_, i) => {
    const values = runs.map((r) => r.seasons[i]?.[key] ?? 0);
    return values.reduce((a, v) => a + v, 0) / Math.max(1, values.length);
  });
  row(
    `${name} (range)`,
    `${pctText(Math.min(...xs))}-${pctText(Math.max(...xs))}`,
    `${pctText(b.tol[0])}-${pctText(b.tol[1])}, every season`,
    true,
    Math.min(...xs) >= b.tol[0] && Math.max(...xs) <= b.tol[1],
  );
};
everySeason("medianSquadCostRatio", "medianSquadCostRatio", band(W, "medianSquadCostRatio"));
everySeason("medianWageRatio", "medianWageRatio", band(W, "medianWageRatio"));
const fees = avg("feesToRevenue");
const feeBand = band(W, "transferFeesToRevenue");
row(
  "transferFeesToRevenue",
  pctText(fees),
  `${pctText(feeBand.tol[0])}-${pctText(feeBand.tol[1])}`,
  true,
  fees >= feeBand.tol[0] && fees <= feeBand.tol[1],
);
const meanDrift = lastOf("seniorMeanOvr") - firstOf("seniorMeanOvr");
const meanBand = band(W, "seniorMeanOvrDrift");
row(
  "seniorMeanOvrDrift (last − season 1)",
  `${meanDrift >= 0 ? "+" : ""}${meanDrift.toFixed(1)}`,
  `within ${meanBand.tol[0]} to +${meanBand.tol[1]}`,
  SEASONS >= 10,
  meanDrift >= meanBand.tol[0] && meanDrift <= meanBand.tol[1],
);
const eliteDrift = lastOf("elite75Share") - firstOf("elite75Share");
const eliteBand = band(W, "elite75ShareDrift");
row(
  "elite75ShareDrift (last − season 1)",
  `${eliteDrift >= 0 ? "+" : ""}${(eliteDrift * 100).toFixed(1)} pts`,
  `within ±${(eliteBand.tol[1] * 100).toFixed(1)} pts`,
  SEASONS >= 10,
  eliteDrift >= eliteBand.tol[0] && eliteDrift <= eliteBand.tol[1],
);
const peak = lastOf("ovrAge27to29");
const younger = Math.max(lastOf("ovrAge21to23"), lastOf("ovrAge24to26"));
row(
  "peak age (last season)",
  `27-29: ${peak.toFixed(1)} v 21-26 best ${younger.toFixed(1)}`,
  "27-29 rated at least as high as 21-23 and 24-26",
  SEASONS >= 10,
  peak >= younger,
);
const ex = runs.map((r) => r.exploits);
const starsChecked = ex.reduce((s, e) => s + e.starsChecked, 0);
const starsBought = ex.reduce((s, e) => s + e.starsBoughtForTwo, 0);
row(
  "exploit: star for two average fees",
  `${starsBought} of ${starsChecked}`,
  "never (final world)",
  true,
  starsChecked > 0 && starsBought === 0,
);
const loansChecked = ex.reduce((s, e) => s + e.loansChecked, 0);
const weakWins = ex.reduce((s, e) => s + e.weakLoanWins, 0);
row(
  "exploit: weak-loan development",
  `${weakWins} of ${loansChecked} grew more far below`,
  "none (final world)",
  true,
  loansChecked > 0 && weakWins === 0,
);

console.log("\nMoney (information)");
for (const league of ["ENG1", "ENG2", "GER1"]) {
  const errors = runs.flatMap((r) => r.anchorErrors[league] ?? []);
  const meanAbs = errors.reduce((s, e) => s + Math.abs(e), 0) / Math.max(1, errors.length);
  const mean = errors.reduce((s, e) => s + e, 0) / Math.max(1, errors.length);
  const worst = Math.max(...errors.map(Math.abs));
  console.log(
    `  ${`season-1 revenue v anchor, ${league}`.padEnd(34)} mean ${(mean * 100).toFixed(1)}%, mean |error| ${(meanAbs * 100).toFixed(1)}%, worst ${(worst * 100).toFixed(0)}%`,
  );
}
const money = (key: string) => fmt(avg(key));
console.log(
  `  ${"revenue mix: gates / TV / commercial / prizes".padEnd(34)} ${money("revenueShareMatchday")} / ${money("revenueShareBroadcast")} / ${money("revenueShareCommercial")} / ${money("revenueSharePrize")}`,
);
console.log(
  `  ${"median wages / revenue (first → last)".padEnd(34)} ${firstLastPct("medianWageRatio")}`,
);
console.log(
  `  ${"median squad cost / revenue (first → last)".padEnd(34)} ${firstLastPct("medianSquadCostRatio")}`,
);
console.log(
  `  ${"FFP: clubs over 70% / banned a season".padEnd(34)} ${money("ffpBreachShare")} / ${money("ffpBanShare")}`,
);
console.log(
  `  ${"clubs with negative cash (first → last season)".padEnd(34)} ${firstLastPct("negativeCashShare")}`,
);
console.log(
  `  ${"median cash / revenue (first → last)".padEnd(34)} ${firstLastPct("medianCashToRevenue")}`,
);

console.log("\nContracts and transfers (information)");
console.log(
  `  ${"per club a season: expired / renewed".padEnd(34)} ${avg("contractsExpired").toFixed(1)} / ${avg("renewals").toFixed(1)}`,
);
console.log(
  `  ${"per club a season: transfers / free agents / loans".padEnd(34)} ${avg("transfers").toFixed(1)} / ${avg("freeAgentSignings").toFixed(1)} / ${avg("loans").toFixed(1)}`,
);
console.log(`  ${"transfer fees / revenue".padEnd(34)} ${money("feesToRevenue")}`);
console.log(`  ${"seniors per club (first → last)".padEnd(34)} ${firstLast("seniorsPerClub")}`);
console.log(
  `  ${"free agents after the summer (first → last)".padEnd(34)} ${firstLast("freeAgentPool")}`,
);

console.log("\nClubs and boards (information)");
console.log(
  `  ${"would be sacked: mid-season / at season end".padEnd(34)} ${firstLastPct("sackedMidSeason").split(" ")[0]} … ${fmt(avg("sackedMidSeason"))} / ${fmt(avg("sackedAtSeasonEnd"))} of clubs a season`,
);
console.log(`  ${"board targets met".padEnd(34)} ${fmt(avg("boardTargetMet"))}`);
console.log(
  `  ${"board confidence, mean at season end".padEnd(34)} ${avg("boardConfidenceMean").toFixed(1)}`,
);
console.log(
  `  ${"hype: mean / spread at season end".padEnd(34)} ${avg("hypeMean").toFixed(1)} / ${avg("hypeSpread").toFixed(1)}`,
);
console.log(
  `  ${"reputation ENG1 / ENG2 / GER1".padEnd(34)} ${firstLast("reputationENG1")} / ${firstLast("reputationENG2")} / ${firstLast("reputationGER1")}`,
);
console.log(
  `  ${"AI dials / facilities (first → last)".padEnd(34)} ${firstLast("aiDialMean")} / ${firstLast("facilitiesMean")}`,
);

console.log("\nFor information");
const info = (label: string, value: string) => console.log(`  ${label.padEnd(34)} ${value}`);
info("parity ENG2 / GER1", `${fmt(avg("parityENG2"))} / ${fmt(avg("parityGER1"))}`);
info("injuries per team per match", fmt(avg("injuriesPerTeamMatch")));
info("training share of injuries", fmt(avg("trainingInjuryShare")));
info("youth intake per season", avg("youthIntake").toFixed(0));
const bySeason = (key: string) =>
  Array.from({ length: SEASONS }, (_, i) => {
    const xs = runs.map((r) => r.seasons[i]?.[key] ?? 0);
    return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  });
info(
  "median squad cost by season",
  bySeason("medianSquadCostRatio")
    .map((x) => (x * 100).toFixed(0))
    .join(" "),
);
info(
  "median cash / revenue by season",
  bySeason("medianCashToRevenue")
    .map((x) => (x * 100).toFixed(0))
    .join(" "),
);
info("senior mean OVR (after season 1 → last)", firstLast("seniorMeanOvr"));
info("seniors rated 75+ (after season 1 → last)", firstLast("elite75Share"));
info(
  "senior OVR by age (after season 1 → last)",
  ["18to20", "21to23", "24to26", "27to29", "30to32", "33plus"]
    .map((band) => `${band.replace("to", "-").replace("plus", "+")}: ${firstLast(`ovrAge${band}`)}`)
    .join("; "),
);
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
