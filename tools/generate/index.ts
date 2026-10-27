/**
 * `pnpm generate [--seed <seed>] [--world <id>] [--check]`: generates a new-league world headlessly
 * and prints a report of the M1 acceptance checks. With --check (CI), exits non-zero
 * if any check fails.
 */
import { createHash } from "node:crypto";
import { ratingsConfig } from "../../src/common/config/ratings";
import { exactAge } from "../../src/common/dates";
import type { Player } from "../../src/common/schema";
import { generateWorld, type World } from "../../src/worker/generate/world";
import { realClubNamesToCheck } from "../real-club-names";
import { worldOption } from "../world-option";
import { evaluateWorld, type Check } from "../../src/worker/generate/checks";

const args = process.argv.slice(2);
const seed = args.includes("--seed") ? (args[args.indexOf("--seed") + 1] ?? "report") : "report";
const strict = args.includes("--check");
const config = worldOption(args);
const options = {
  config,
  seed,
  name: "Report",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const started = performance.now();
const world = generateWorld(options);
const elapsed = performance.now() - started;

const fingerprint = (w: World) =>
  createHash("sha256")
    .update(JSON.stringify({ ...w, xiStrength: [...w.xiStrength] }))
    .digest("hex");
const deterministic = fingerprint(world) === fingerprint(generateWorld(options));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const seniors = world.players.filter((p) => p.status === "club");
const academy = world.players.filter((p) => p.status === "academy");
const freeAgents = world.players.filter((p) => p.status === "freeAgent");
const ageOf = (p: Player) => exactAge(p.birthDate, config.competitions.seasonStart);

console.log(
  `Soccer Sim Game: new-league report (seed "${seed}", generated in ${elapsed.toFixed(0)} ms)\n`,
);
console.log(
  `Players: ${seniors.length} senior + ${academy.length} academy = ${seniors.length + academy.length} at clubs; ` +
    `${freeAgents.length} free agents; ${world.players.length} total`,
);

console.log("\nOVR bands (senior club players):");
ratingsConfig.ovrBands.forEach((band, i) => {
  // Bands are sorted best first, so the band above this one is the previous entry.
  const next = ratingsConfig.ovrBands[i - 1]?.min ?? 101;
  const n = seniors.filter((p) => p.ovr >= band.min && p.ovr < next).length;
  const range = next > 100 ? `${band.min}+` : `${band.min}-${next - 1}`;
  console.log(
    `  ${range.padEnd(6)} ${band.label.padEnd(22)} ${String(n).padStart(5)}  ${pct(n / seniors.length)}`,
  );
});

for (const league of config.competitions.leagues) {
  console.log(`\n${league.id}  club                          target   XI     Δ   wage%   form.`);
  for (const club of world.clubs.filter((c) => c.leagueId === league.id)) {
    const xi = world.xiStrength.get(club.cid) ?? NaN;
    const cs = world.clubSeasons.find((s) => s.cid === club.cid);
    console.log(
      `      ${club.name.padEnd(30)} ${String(club.strengthTarget).padStart(4)}  ${xi.toFixed(2).padStart(6)} ` +
        `${(xi - club.strengthTarget).toFixed(2).padStart(5)}  ${pct(cs?.squadCostRatio ?? NaN).padStart(6)}   ${club.tactics.formation}`,
    );
  }
}

console.log("\nPOT and ages:");
for (const [label, lo, hi] of [
  ["15-18", 15, 19],
  ["19-21", 19, 22],
  ["22-25", 22, 26],
  ["26-29", 26, 30],
  ["30+", 30, 99],
] as const) {
  const group = [...seniors, ...academy].filter((p) => ageOf(p) >= lo && ageOf(p) < hi);
  const gap = group.reduce((s, p) => s + (p.pot - p.ovr), 0) / Math.max(1, group.length);
  console.log(
    `  age ${label.padEnd(6)} n=${String(group.length).padStart(4)}  mean OVR ${(group.reduce((s, p) => s + p.ovr, 0) / Math.max(1, group.length)).toFixed(1)}  mean POT-OVR ${gap.toFixed(1)}`,
  );
}
for (const league of config.competitions.leagues) {
  const cids = new Set(world.clubs.filter((c) => c.leagueId === league.id).map((c) => c.cid));
  const kids = academy.filter((p) => p.cid !== null && cids.has(p.cid));
  console.log(
    `  ${league.id}: ${kids.filter((p) => p.pot >= 75).length} academy players with POT 75+ (of ${kids.length})`,
  );
}

const checks: Check[] = evaluateWorld(world, {
  deterministic,
  realNames: realClubNamesToCheck().names,
});
console.log("\nChecks:");
for (const check of checks)
  console.log(`  ${check.pass ? "PASS" : "FAIL"}  ${check.name}  (${check.detail})`);
const failed = checks.filter((c) => !c.pass).length;
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
if (strict && failed > 0) process.exitCode = 1;
