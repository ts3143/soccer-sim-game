/**
 * The tier report for a world of tiers (the Super League, SPEC §17.9), run by
 * `pnpm calibrate --world superLeague [--seasons 20] [--worlds 3] [--seed X] [--check]
 * [--overrides JSON]` (overrides as `pnpm calibrate --world`'s, the world's config by its id).
 * Plays W worlds for S seasons each (in parallel processes) and reports the acceptance
 * (every season played, exactly the configured places up and down, nobody out of the
 * lowest tier: gated), yo-yo clubs, the rise from the bottom of the lowest tier to the top
 * of the highest (target in calibration_targets.json, gated from SL6), tier mobility and
 * the player pool, the world's health (gated from SL4: the player count, the squads' OVRs
 * and ages at the first league match, retirements; with --seasons 10 or more), the AI's
 * trades, cap violations and the luxury tax (gated from SL5: relegated clubs back under
 * their own cap the season after their grace).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { worldOption } from "../world-option";
import {
  lastShape,
  mobility,
  moveProblems,
  playerCountDrift,
  rise,
  riseBreakdown,
  shapeDrift,
  tierStrengths,
  type TierRun,
  yoYo,
} from "./tiers";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const SEASONS = Number(option("--seasons", "20"));
const WORLDS = Number(option("--worlds", "3"));
const SEED = option("--seed", "calibrate");
const CHECK = args.includes("--check");
const OVERRIDES = option("--overrides", "");
const world = worldOption(args);
const JOBS = Math.max(
  1,
  Math.min(WORLDS, Number(option("--jobs", String(availableParallelism())))),
);

interface Band {
  target: number;
  tol: [number, number];
  /** Drift measured from this season (default 1). */
  fromSeason?: number;
  note: string;
}
interface RiseTarget extends Band {
  fromBottom: number;
  toTop: number;
}
type Group = Record<string, unknown>;
const targets = JSON.parse(
  readFileSync(new URL("../../data/config/calibration_targets.json", import.meta.url), "utf8"),
) as { superLeague: Group; worldStability20Seasons: Group };
const band = (group: Group, key: string): Band => {
  const value = group[key];
  if (typeof value !== "object" || value === null || !("tol" in value))
    throw new Error(`No band for ${key}`);
  return value as Band;
};
const riseTarget = band(targets.superLeague, "riseSeasons") as RiseTarget;

function runWorld(seed: string): Promise<TierRun> {
  const script = fileURLToPath(new URL("./tiers-run.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, seed, String(SEASONS), world.id],
      {
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env, ...(OVERRIDES ? { CALIBRATE_OVERRIDES: OVERRIDES } : {}) },
      },
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
console.log(`  ${WORLDS} worlds x ${SEASONS} seasons`);
if (OVERRIDES) console.log(`  overrides: ${OVERRIDES}`);
console.log("");

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

// The rise taken apart (SL6): its seasons by league, where unfinished rises stand, and how
// promoted clubs do in their first season up; and each world's average.
const parts = riseBreakdown(runs, bottom, riseTarget.fromBottom, top, riseTarget.toTop);
const byLeague = (record: Record<string, number>, show: (x: number) => string) =>
  leagues.map((l) => `${l.id} ${show(record[l.id] ?? 0)}`).join(", ");
console.log(
  `           seasons on the way, by league: ${byLeague(parts.seasonsIn, (x) => x.toFixed(1))}`,
);
console.log(
  `           still on the way, by the league played last: ${byLeague(parts.runningIn, String)}`,
);
for (const l of leagues) {
  const f = parts.firstSeason[l.id];
  if (!f) continue;
  const next =
    l.id === top ? `top ${riseTarget.toTop} ${pct(f.topShare)}` : `up again ${pct(f.upAgain)}`;
  console.log(
    `           first season after promotion into ${l.id}: ${f.clubs} clubs, mean finish ${f.meanFinish.toFixed(1)}, ${next}`,
  );
}
const perWorld = runs.map((run) => {
  const w = rise([run], bottom, riseTarget.fromBottom, top, riseTarget.toTop);
  return w.seasons.length ? mean(w.seasons).toFixed(1) : "-";
});
console.log(`           average by world: ${perWorld.join(", ")}`);

// How far apart the tiers stand, and how much strength decides a table (SL6).
const strengths = tierStrengths(runs);
console.log("\nStrength (best 11's mean OVR at the first match)");
for (const l of leagues) {
  const t = strengths[l.id];
  if (!t) continue;
  console.log(
    `  ${l.id}: mean ${t.mean.toFixed(1)}, strongest less weakest ${t.spread.toFixed(1)}, table against strength (rank correlation) ${t.correlation.toFixed(2)}`,
  );
}

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
    `  ${run.seed}: active players ${run.activeAtStart} -> ${run.activeAfter.at(-1)}; seniors per club at the first match ${Math.min(...seniors.map((s) => s.min))}-${Math.max(...seniors.map((s) => s.max))}; free agents ${Math.min(...run.seasons.map((s) => s.freeAgents))}-${Math.max(...run.seasons.map((s) => s.freeAgents))}`,
  );
}

const trades = runs.flatMap((run) => run.seasons.map((s) => s.trades));
const tradeCount = trades.reduce((a, t) => a + t.count, 0);
console.log("\nTrades (AI to AI, while trades are open)");
const most = Math.max(...runs.map((r) => r.picksHeld.most));
const none = Math.max(...runs.map((r) => r.picksHeld.none));
const fair =
  (world.competitions.draft?.rounds ?? 0) * (1 + (world.competitions.draft?.picksAhead ?? 0));
console.log(
  `  picks held at the end: at most ${most} by one club (its own are ${fair}); clubs with none, at most ${none} a world`,
);
console.log(
  `  ${(tradeCount / Math.max(1, trades.length)).toFixed(1)} a season (${Math.min(...trades.map((t) => t.count))}-${Math.max(...trades.map((t) => t.count))}); per trade ${(trades.reduce((a, t) => a + t.players, 0) / Math.max(1, tradeCount)).toFixed(1)} players and ${(trades.reduce((a, t) => a + t.picks, 0) / Math.max(1, tradeCount)).toFixed(1)} picks`,
);

// The world's health (MILESTONES SL4): Classic's checks, the squads measured at the first
// league match (in the summer they're still forming: free agency runs to the deadline).
const SL = targets.superLeague;
const CLASSIC = targets.worldStability20Seasons;
const failed: string[] = [];
const gate = (ok: boolean, text: string, gated = true) => {
  console.log(
    `  ${ok ? "PASS" : gated ? "FAIL" : "off "}  ${text}${gated ? "" : " (information)"}`,
  );
  if (gated && !ok) failed.push(text);
};
const inBandOf = (x: number, b: Band) => x >= b.tol[0] && x <= b.tol[1];
const signed = (x: number, digits = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;
const pts = (x: number) => `${signed(x * 100)} pts`;
const drifts = SEASONS >= 10;
console.log(
  `\nWorld health (gated${drifts ? "" : " from 10 seasons"}; seniors at the first league match)`,
);
const count = playerCountDrift(runs);
const countBand = band(SL, "playerCountDrift");
gate(
  count <= countBand.tol[1],
  `active players after every season within ±${countBand.tol[1] * 100}% of the start: worst ${(count * 100).toFixed(1)}%`,
);
const shapeGate = (
  key: Parameters<typeof shapeDrift>[1],
  b: Band,
  label: string,
  show: (x: number) => string,
) => {
  const from = Math.min(b.fromSeason ?? 1, SEASONS);
  const d = shapeDrift(runs, key, from);
  gate(
    inBandOf(d, b),
    `${label}, last season less season ${from}: ${show(d)} (band ${show(b.tol[0])} to ${show(b.tol[1])})`,
    drifts,
  );
};
shapeGate("seniorMeanOvr", band(CLASSIC, "seniorMeanOvrDrift"), "senior mean OVR", signed);
shapeGate("elite75Share", band(CLASSIC, "elite75ShareDrift"), "seniors rated 75+", pts);
shapeGate("meanAge", band(SL, "seniorMeanAgeDrift"), "seniors' mean age", signed);
shapeGate("under23Share", band(SL, "under23ShareDrift"), "seniors under 23", pts);
shapeGate("age30plusShare", band(SL, "age30plusShareDrift"), "seniors 30 or older", pts);
const peakTolerance = (CLASSIC.peakAge as { tolerance: number }).tolerance;
const peak = lastShape(runs, "ovrAge27to29");
const younger = Math.max(lastShape(runs, "ovrAge21to23"), lastShape(runs, "ovrAge24to26"));
gate(
  peak >= younger - peakTolerance,
  `peak age, last season: 27-29 rated ${peak.toFixed(1)} v 21-26 best ${younger.toFixed(1)} (at least that less ${peakTolerance})`,
  drifts,
);
const retirements = runs.flatMap((run) => run.retirements);
const share3337 =
  retirements.filter((x) => x.age >= 33 && x.age < 38).length / Math.max(1, retirements.length);
const meanAge = (xs: { age: number }[]) => mean(xs.map((x) => x.age));
const gkAge = meanAge(retirements.filter((x) => x.gk));
const outfieldAge = meanAge(retirements.filter((x) => !x.gk));
gate(
  share3337 >= 0.5 && gkAge > outfieldAge,
  `retirements of players 30+: ${pct(share3337)} at 33-37 (most), goalkeepers ${gkAge.toFixed(1)} v ${outfieldAge.toFixed(1)} (later)`,
);
// A closed world of draftees settles younger than the generated start: shown, not gated.
const settled = Math.min(band(SL, "seniorMeanAgeDrift").fromSeason ?? 1, SEASONS);
const span = (key: Parameters<typeof shapeDrift>[1], show: (x: number) => string) =>
  [1, settled]
    .map((from) => show(lastShape(runs, key) - shapeDrift(runs, key, from)))
    .concat(show(lastShape(runs, key)))
    .join(" -> ");
console.log(
  `        season 1 -> ${settled} -> last: mean OVR ${span("seniorMeanOvr", (x) => x.toFixed(1))}, 75+ ${span("elite75Share", pct)}, mean age ${span("meanAge", (x) => x.toFixed(1))}, under 23 ${span("under23Share", pct)}, 30+ ${span("age30plusShare", pct)}`,
);

// MILESTONES SL5: the exploit checks, on each run's final world.
const ex = runs.map((r) => r.exploits);
const sum = (key: keyof (typeof ex)[0]) => ex.reduce((a, e) => a + e[key], 0);
console.log("\nTrade exploits (gated from SL5; each run's final world)");
gate(
  sum("starsChecked") > 0 && sum("starsEqualled") === 0,
  `two average players never equal a star in talent (by squad place): ${sum("starsEqualled")} of ${sum("starsChecked")}`,
);
gate(
  sum("starsBought") === 0,
  `  taken with contracts and cap room counted (an overpaid veteran, a club shedding wages): ${sum("starsBought")} of ${sum("starsChecked")}`,
  false,
);
gate(
  sum("picksChecked") > 0 && sum("picksOutOfOrder") === 0,
  `a pick is worth less a draft later and from a stronger original owner: ${sum("picksOutOfOrder")} of ${sum("picksChecked")} pairs out of order`,
);

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
// MILESTONES SL5: relegated clubs back under their own cap by the close of the season after
// their grace (relegations in the run's last two seasons can't be judged yet).
const backUnder = SL.relegatedBackUnderCap as { maxStillOver: number; note: string };
const judged = runs.reduce(
  (a, run) =>
    a +
    run.seasons
      .slice(0, Math.max(0, run.seasons.length - 2))
      .reduce((b, s) => b + s.moves.filter((m) => m.reason === "relegated").length, 0),
  0,
);
const stillOver = caps.reduce((a, c) => a + c.afterGrace, 0);
gate(
  stillOver <= backUnder.maxStillOver * judged,
  `relegated clubs back under their own cap the season after their grace: ${judged - stillOver} of ${judged} (still over ${stillOver}; at most ${pct(backUnder.maxStillOver)})`,
  SEASONS >= 3,
);
console.log(`\nwall time ${((performance.now() - started) / 1000).toFixed(0)} s`);

if (CHECK && problems.length + failed.length > 0) {
  console.log("\nGated checks failed.");
  process.exitCode = 1;
} else if (CHECK) console.log("\nAll gated checks pass.");
