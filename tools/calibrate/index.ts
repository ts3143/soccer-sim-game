/**
 * Calibration harness: `pnpm calibrate [--matches N] [--seed S]`.
 *
 * Generates a world, then simulates N matches between random pairs of clubs from the
 * same league, with league styles neutral (all modifiers 1.0), and reports each
 * per-match target in data/config/calibration_targets.json as PASS/FAIL. Metrics the
 * engine doesn't produce yet are listed as "not yet".
 */
import { readFileSync } from "node:fs";
import { competitionsConfig } from "../../src/common/config/competitions";
import type { Club, Player } from "../../src/common/schema";
import { Random } from "../../src/worker/core/random";
import { simulateMatch } from "../../src/worker/engine/match";
import { teamInput } from "../../src/worker/engine/prepare";
import type { EngineTeamInput, MatchResult } from "../../src/worker/engine/types";
import { generateWorld } from "../../src/worker/generate/world";

interface Target {
  target: number;
  tol: [number, number];
}

const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const MATCHES = Number(option("--matches", "10000"));
const SEED = option("--seed", "calibrate");

const targets = JSON.parse(
  readFileSync(new URL("../../data/config/calibration_targets.json", import.meta.url), "utf8"),
) as { perMatch: Record<string, Target | string> };

const world = generateWorld({
  seed: SEED,
  name: "calibrate",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const squads = new Map<number, Player[]>();
for (const p of world.players) {
  if (p.cid !== null) squads.set(p.cid, [...(squads.get(p.cid) ?? []), p]);
}
const inputs = new Map<number, EngineTeamInput>(
  world.clubs.map((club: Club) => [club.cid, teamInput(club, squads.get(club.cid) ?? [])]),
);
const clubsByLeague = new Map(
  competitionsConfig.leagues.map((l) => [l.id, world.clubs.filter((c) => c.leagueId === l.id)]),
);
// Pick leagues in proportion to their number of league matches per season.
const leagueWeights = competitionsConfig.leagues.map((l) => ({
  id: l.id,
  w: l.clubs * (l.clubs - 1),
}));

const NEUTRAL = { chanceQuality: 1, foulRate: 1, directness: 0 };
const fixtures = Random.fromSeed(`${SEED}/fixtures`);
const results: MatchResult[] = [];
const started = performance.now();
for (let i = 0; i < MATCHES; i++) {
  const league = fixtures.weighted(leagueWeights, (l) => l.w).id;
  const clubs = clubsByLeague.get(league) ?? [];
  const [home, away] = fixtures.shuffle(clubs).slice(0, 2) as [Club, Club];
  results.push(
    simulateMatch({
      seed: `${SEED}/match:${i}`,
      home: inputs.get(home.cid) as EngineTeamInput,
      away: inputs.get(away.cid) as EngineTeamInput,
      neutralVenue: false,
      style: NEUTRAL,
      knockout: null,
      feed: false,
    }),
  );
}
const msPerMatch = (performance.now() - started) / MATCHES;

const n = results.length;
const sum = (f: (r: MatchResult) => number) => results.reduce((s, r) => s + f(r), 0);
const share = (f: (r: MatchResult) => boolean) => results.filter(f).length / n;
const goals = (r: MatchResult) => r.homeGoals + r.awayGoals;
const totalShots = sum((r) => r.teams[0].shots + r.teams[1].shots);
const teamMatches = results.flatMap((r) => r.teams);

const measured: Record<string, number> = {
  goals: sum(goals) / n,
  homeWinPct: share((r) => r.homeGoals > r.awayGoals),
  drawPct: share((r) => r.homeGoals === r.awayGoals),
  awayWinPct: share((r) => r.homeGoals < r.awayGoals),
  nilNilPct: share((r) => goals(r) === 0),
  fourPlusGoalsPct: share((r) => goals(r) >= 4),
  shotsTotal: totalShots / n,
  onTargetShare: sum((r) => r.teams[0].shotsOnTarget + r.teams[1].shotsOnTarget) / totalShots,
  xgPerShot: sum((r) => r.teams[0].xg + r.teams[1].xg) / totalShots,
  conversionRate: sum(goals) / totalShots,
};
const possessionInRange =
  teamMatches.filter((t) => t.possession >= 0.3 && t.possession <= 0.7).length / teamMatches.length;

const fmt = (x: number) => (Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(2));
console.log(
  `Soccer Sim Game: calibration (seed "${SEED}", ${n.toLocaleString("en-GB")} matches, neutral league style)\n`,
);
console.log("metric               measured   target   band            result");
let failed = 0;
for (const [name, spec] of Object.entries(targets.perMatch)) {
  if (name.startsWith("_")) continue;
  if (name === "possessionRange") {
    const pass = possessionInRange >= 0.95;
    if (!pass) failed++;
    console.log(
      `${"possessionRange".padEnd(20)} ${(possessionInRange * 100).toFixed(1).padStart(7)}%   ≥95% of team-matches in 30-70%   ${pass ? "PASS" : "FAIL"}`,
    );
    continue;
  }
  if (typeof spec === "string") continue;
  const value = measured[name];
  if (value === undefined) {
    console.log(
      `${name.padEnd(20)} ${"-".padStart(8)}   ${fmt(spec.target).padStart(6)}   ${`${spec.tol[0]}-${spec.tol[1]}`.padEnd(14)}  not yet`,
    );
    continue;
  }
  const pass = value >= spec.tol[0] && value <= spec.tol[1];
  if (!pass) failed++;
  console.log(
    `${name.padEnd(20)} ${fmt(value).padStart(8)}   ${fmt(spec.target).padStart(6)}   ${`${spec.tol[0]}-${spec.tol[1]}`.padEnd(14)}  ${pass ? "PASS" : "FAIL"}`,
  );
}
console.log(`\nSpeed: ${msPerMatch.toFixed(2)} ms per match (budget < 5 ms)`);
console.log(
  `Possessions per match: ${(sum((r) => r.teams[0].possessions + r.teams[1].possessions) / n).toFixed(1)}, ` +
    `passes per team: ${(sum((r) => r.teams[0].passes + r.teams[1].passes) / (2 * n)).toFixed(0)}`,
);
console.log(
  failed === 0
    ? "\nAll measured targets pass."
    : `\n${failed} measured target(s) outside their band.`,
);
