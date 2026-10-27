/**
 * The tier report for a world of tiers (the Super League, SPEC §17.9), run by
 * `pnpm calibrate --world superLeague [--seasons 20] [--worlds 3] [--seed X] [--check]`.
 * Plays W worlds for S seasons each (in parallel processes) and reports the acceptance
 * (every season played, exactly the configured places up and down, nobody out of the
 * lowest tier: gated), yo-yo clubs, the rise from the bottom of the lowest tier to the top
 * of the highest (target in calibration_targets.json, gated from SL6), tier mobility and
 * the player pool, cap violations and the luxury tax.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { worldOption } from "../world-option";
import { mobility, moveProblems, rise, type TierRun, yoYo } from "./tiers";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const SEASONS = Number(option("--seasons", "20"));
const WORLDS = Number(option("--worlds", "3"));
const SEED = option("--seed", "calibrate");
const CHECK = args.includes("--check");
const world = worldOption(args);
const JOBS = Math.max(
  1,
  Math.min(WORLDS, Number(option("--jobs", String(availableParallelism())))),
);

interface RiseTarget {
  fromBottom: number;
  toTop: number;
  target: number;
  tol: [number, number];
  note: string;
}
const targets = JSON.parse(
  readFileSync(new URL("../../data/config/calibration_targets.json", import.meta.url), "utf8"),
) as { superLeague: { riseSeasons: RiseTarget } };
const riseTarget = targets.superLeague.riseSeasons;

function runWorld(seed: string): Promise<TierRun> {
  const script = fileURLToPath(new URL("./tiers-run.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, seed, String(SEASONS), world.id],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`World ${seed} failed (exit ${code})`));
      else resolve(JSON.parse(out) as TierRun);
    });
  });
}

const started = performance.now();
const seeds = Array.from({ length: WORLDS }, (_, w) => `${SEED}-w${w}`);
const runs: TierRun[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    while (next < seeds.length) {
      const seed = seeds[next++] as string;
      runs.push(await runWorld(seed));
      process.stderr.write(`  world ${seed}: ${SEASONS} seasons done\n`);
    }
  }),
);
runs.sort((a, b) => a.seed.localeCompare(b.seed));

const leagues = [...world.competitions.leagues].sort((a, b) => a.tier - b.tier);
const top = leagues[0]?.id ?? "";
const bottom = leagues.at(-1)?.id ?? "";
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: readonly number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log(`Soccer Sim Game: tier report (world ${world.id}, seed "${SEED}")`);
console.log(`  ${WORLDS} worlds x ${SEASONS} seasons\n`);

const problems = [
  ...runs.flatMap((r) =>
    r.seasons.length === SEASONS ? [] : [`${r.seed}: ${r.seasons.length} of ${SEASONS} seasons`],
  ),
  ...runs.flatMap((r) => moveProblems(r, world.competitions)),
];
console.log("Acceptance (gated)");
console.log(
  `  ${problems.length === 0 ? "PASS" : "FAIL"}  every season played; exactly the configured places up and down; nobody out of ${bottom}`,
);
for (const p of problems.slice(0, 10)) console.log(`        ${p}`);

const y = yoYo(runs);
console.log("\nYo-yo clubs");
console.log(
  `  promotions followed by relegation within 2 seasons: ${y.yoYos} of ${y.promotions} (${pct(y.yoYos / Math.max(1, y.promotions))})`,
);

const r = rise(runs, bottom, riseTarget.fromBottom, top, riseTarget.toTop);
const avg = mean(r.seasons);
const inBand = avg >= riseTarget.tol[0] && avg <= riseTarget.tol[1];
console.log(
  `\nThe rise (${bottom} bottom ${riseTarget.fromBottom} to ${top} top ${riseTarget.toTop})`,
);
console.log(
  `  ${inBand ? "in band" : "OFF BAND"}  average ${r.seasons.length ? avg.toFixed(1) : "-"} seasons, median ${r.seasons.length ? median(r.seasons) : "-"} (target ${riseTarget.tol[0]}-${riseTarget.tol[1]}; ${riseTarget.note})`,
);
console.log(
  `           ${r.seasons.length} made it, ${r.never} still on the way when the runs ended (${pct(r.never / Math.max(1, r.never + r.seasons.length))})`,
);

const m = mobility(runs, top, world.clubs.length, [10, 20]);
console.log("\nTier mobility");
console.log(`  moves (up or down) per club per season ${m.movesPerClubSeason.toFixed(3)}`);
console.log(`  distinct clubs that played in ${top}, per world: ${m.topClubs.join(", ")}`);
for (const [n, still] of Object.entries(m.openingStill)) {
  if (still.length)
    console.log(`  opening ${top} clubs still there after ${n} seasons: ${still.join(", ")}`);
}

console.log("\nPlayer pool");
for (const run of runs) {
  const seniors = run.seasons.map((s) => s.seniors);
  console.log(
    `  ${run.seed}: active players ${run.activeAtStart} -> ${run.activeAfter.at(-1)}; seniors per club ${Math.min(...seniors.map((s) => s.min))}-${Math.max(...seniors.map((s) => s.max))}; free agents ${Math.min(...run.seasons.map((s) => s.freeAgents))}-${Math.max(...run.seasons.map((s) => s.freeAgents))}`,
  );
}
const caps = runs.flatMap((run) => run.seasons.map((s) => s.cap));
const clubSeasons = caps.length * world.clubs.length;
const over = caps.reduce((a, c) => a + c.over, 0);
console.log("\nCap violations (at season end, 30 June)");
console.log(
  `  club-seasons over the cap: ${over} of ${clubSeasons} (${pct(over / Math.max(1, clubSeasons))})`,
);
console.log(
  `  luxury tax paid: EUR ${(caps.reduce((a, c) => a + c.taxPaid, 0) / 1e6).toFixed(1)}m in all, ${caps.filter((c) => c.taxPaid > 0).length} of ${caps.length} seasons with any`,
);
console.log(
  `  relegated clubs still over their own cap after their grace: ${caps.reduce((a, c) => a + c.afterGrace, 0)}`,
);
console.log(`\nwall time ${((performance.now() - started) / 1000).toFixed(0)} s`);

if (CHECK && problems.length > 0) {
  console.log("\nGated checks failed.");
  process.exitCode = 1;
} else if (CHECK) console.log("\nAll gated checks pass.");
