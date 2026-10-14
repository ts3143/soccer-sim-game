/**
 * Calibration harness: `pnpm calibrate [--matches N] [--seasons S] [--seed X] [--check]`.
 *
 * Gates (M2): every per-match target in data/config/calibration_targets.json on a
 * neutral sample (league styles at 1.0); each league's style-scaled checks (leagueChecks)
 * over round-robin seasons; under 5 ms per match. Season targets, parity included, are
 * reported for information (gated in M3 with the real calendar, rotation and fatigue). Prints the
 * Team OVR fit and the match-rating centring values. With --check, exits 1 on a failure.
 */
import { readFileSync } from "node:fs";
import { competitionsConfig } from "../../src/common/config/competitions";
import { COEFFICIENTS } from "../../src/worker/engine/coefficients";
import { generateWorld } from "../../src/worker/generate/world";
import { fitTeamOvr, RATING_KEYS, ratingCentring } from "./fit";
import { averageSeasons, perMatch, seasonMetrics, type SeasonMetrics } from "./metrics";
import { League } from "./runs";

interface Band {
  target: number;
  tol: [number, number];
}
interface Targets {
  perMatch: Record<string, Band | string>;
  perSeason: Record<string, Band | string>;
  leagueChecks: { chanceQuality: string[]; foulRate: string[] };
}

const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const MATCHES = Number(option("--matches", "10000"));
const SEASONS = Number(option("--seasons", "2"));
/** Several generated worlds, so one world's random formation draw doesn't decide calibration. */
const WORLDS = Number(option("--worlds", "3"));
const SEED = option("--seed", "calibrate");
const CHECK = args.includes("--check");

const targets = JSON.parse(
  readFileSync(new URL("../../data/config/calibration_targets.json", import.meta.url), "utf8"),
) as Targets;
const isBand = (v: Band | string | undefined): v is Band => typeof v === "object" && v !== null;

let failures = 0;
const fmt = (x: number) => (Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(2));
const verdict = (pass: boolean, gated = true) => {
  if (gated && !pass) failures++;
  return gated ? (pass ? "PASS" : "FAIL") : pass ? "ok" : "off";
};
const line = (name: string, value: number, band: Band, gated = true) => {
  const pass = value >= band.tol[0] && value <= band.tol[1];
  console.log(
    `  ${name.padEnd(20)} ${fmt(value).padStart(8)}   ${fmt(band.target).padStart(6)}   ${`${fmt(band.tol[0])}-${fmt(band.tol[1])}`.padEnd(13)} ${verdict(pass, gated)}`,
  );
};

const leagues = Array.from(
  { length: WORLDS },
  (_, w) =>
    new League(
      generateWorld({
        seed: `${SEED}-w${w}`,
        name: "calibrate",
        userCid: 0,
        createdAt: "2026-07-01T00:00:00.000Z",
      }),
    ),
);

// ---------------------------------------------------------------------------
// 1. Neutral sample

const started = performance.now();
const sample = leagues.flatMap((league, w) =>
  league.neutralSample(Math.round(MATCHES / WORLDS), `${SEED}-w${w}`),
);
const msPerMatch = (performance.now() - started) / sample.length;
const neutral = perMatch(sample);

console.log(`Soccer Sim Game: calibration (seed "${SEED}")\n`);
console.log(
  `Neutral sample: ${sample.length.toLocaleString("en-GB")} matches across ${WORLDS} generated worlds, league styles at 1.0`,
);
console.log("  metric               measured   target   band          result");
for (const [name, spec] of Object.entries(targets.perMatch)) {
  if (name === "possessionRange") {
    const pass = (neutral.possessionInRange as number) >= 0.95;
    console.log(
      `  ${"possessionRange".padEnd(20)} ${`${((neutral.possessionInRange as number) * 100).toFixed(1)}%`.padStart(8)}   95% of team-matches in 30-70%  ${verdict(pass)}`,
    );
  } else if (isBand(spec) && neutral[name] !== undefined) {
    line(name, neutral[name], spec);
  }
}

// ---------------------------------------------------------------------------
// 2. Leagues: style-scaled checks and season numbers

const seasonsByLeague = new Map<string, SeasonMetrics>();
for (const config of competitionsConfig.leagues) {
  const seasons = leagues.flatMap((league, w) =>
    league.seasons(config.id, SEASONS, `${SEED}-w${w}`),
  );
  const all = seasons.flat();
  const metrics = perMatch(all);
  const style = config.styleModifiers;
  console.log(
    `\n${config.id} (${config.name}): ${seasons.length} round-robin seasons (${SEASONS} in each of ${WORLDS} worlds), ${all.length.toLocaleString("en-GB")} matches; chance quality ${style.chanceQuality}, foul rate ${style.foulRate}`,
  );
  console.log("  metric               measured   target   band          result");
  const scaled = [
    ...targets.leagueChecks.chanceQuality.map((m) => [m, style.chanceQuality] as const),
    ...targets.leagueChecks.foulRate.map((m) => [m, style.foulRate] as const),
  ];
  for (const [name, factor] of scaled) {
    const spec = targets.perMatch[name];
    if (!isBand(spec)) continue;
    line(name, metrics[name] as number, {
      target: spec.target * factor,
      tol: [spec.tol[0] * factor, spec.tol[1] * factor],
    });
  }
  for (const name of ["homeWinPct", "drawPct", "nilNilPct", "fourPlusGoalsPct", "shotsTotal"]) {
    const spec = targets.perMatch[name];
    if (isBand(spec)) line(name, metrics[name] as number, spec, false);
  }
  const season = averageSeasons(seasons.map(seasonMetrics));
  seasonsByLeague.set(config.id, season);
}

console.log("\nSeason numbers (average per season; information only: gated in M3)");
console.log("  league  champion  bottom  top scorer  top assists  top-6 lose to bottom-6");
for (const [id, s] of seasonsByLeague) {
  console.log(
    `  ${id.padEnd(6)}  ${s.championPoints.toFixed(1).padStart(8)}  ${s.bottomPoints.toFixed(1).padStart(6)}  ${s.topScorerGoals.toFixed(1).padStart(10)}  ${s.topAssists.toFixed(1).padStart(11)}  ${(s.top6LoseToBottom6Pct * 100).toFixed(1).padStart(10)}%`,
  );
}
const eng1 = seasonsByLeague.get("ENG1");
if (eng1) {
  console.log("  ENG1 against the season targets:");
  const seasonTarget = (name: string) => targets.perSeason[name] as Band;
  line("championPointsENG1", eng1.championPoints, seasonTarget("championPointsENG1"), false);
  line("bottomPointsENG1", eng1.bottomPoints, seasonTarget("bottomPointsENG1"), false);
  line("topScorerGoals", eng1.topScorerGoals, seasonTarget("topScorerGoals"), false);
  line("topAssists", eng1.topAssists, seasonTarget("topAssists"), false);
  // Parity is gated in M3 (T, 2026-10-14), once rotation, fatigue and injuries exist.
  line(
    "top6LoseToBottom6Pct",
    eng1.top6LoseToBottom6Pct,
    seasonTarget("top6LoseToBottom6Pct"),
    false,
  );
}

// ---------------------------------------------------------------------------
// 3. Speed, information, fits

console.log("\nSpeed");
line("ms per match", msPerMatch, { target: 1, tol: [0, 5] });

console.log("\nFor information (neutral sample)");
const info = (label: string, value: string) => console.log(`  ${label.padEnd(36)} ${value}`);
info("injuries per team per match", fmt(neutral.injuriesPerTeam as number));
info(
  "passes per team / completion",
  `${(neutral.passesPerTeam as number).toFixed(0)} / ${((neutral.passCompletion as number) * 100).toFixed(1)}%`,
);
info(
  "ratings below 5.0 / above 8.5 / 9+",
  `${((neutral.ratingsBelow5 as number) * 100).toFixed(1)}% / ${((neutral.ratingsAbove85 as number) * 100).toFixed(1)}% / ${((neutral.ratings9Plus as number) * 100).toFixed(2)}%`,
);
const centring = ratingCentring(sample);
info(
  "rating centring (raw mean, 60+ min)",
  Object.entries(centring)
    .map(
      ([position, v]) =>
        `${position} ${v.toFixed(2)} (now ${COEFFICIENTS.ratings.expected[position as keyof typeof COEFFICIENTS.ratings.expected]})`,
    )
    .join(", "),
);

const fit = fitTeamOvr(sample);
console.log(
  `\nTeam OVR fit: goal difference on team-rating differences (R² ${fit.r2.toFixed(3)}, home intercept ${fit.intercept.toFixed(3)})`,
);
console.log(
  "  " +
    RATING_KEYS.map(
      (key) =>
        `${key} ${fit.coefficients[key].toFixed(4)} (weight ${(fit.weights[key] * 100).toFixed(0)}%)`,
    ).join(", "),
);

console.log(failures === 0 ? "\nAll gated checks pass." : `\n${failures} gated check(s) failed.`);
if (CHECK && failures > 0) process.exitCode = 1;
