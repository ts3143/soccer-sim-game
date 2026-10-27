/**
 * Fits RATING_SCALE in src/worker/engine/teamRatings.ts: for every club's best XI in
 * several generated worlds, regress each raw team-rating recipe on the XI's mean slot
 * OVR (raw ≈ offset + scale × OVR). Dividing out the fit puts all team ratings on the
 * player-OVR scale, so the match engine behaves the same at every level of football.
 *
 *   pnpm exec tsx tools/fit-team-ratings.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { formationById } from "../src/common/config/formations";
import { worlds } from "../src/common/config/worlds";
import { RATING_INDEX } from "../src/common/config/ratings";
import type { Player } from "../src/common/schema";
import { bestXi } from "../src/worker/core/lineup";
import { teamInput } from "../src/worker/engine/prepare";
import { formationPlan, rawRecipeQualities, RECIPE_NAMES } from "../src/worker/engine/teamRatings";
import { generateWorld } from "../src/worker/generate/world";

const SEEDS = ["fit-a", "fit-b", "fit-c", "fit-d", "fit-e"];
type Key = (typeof RECIPE_NAMES)[number] | "setPieces";
const samples: { ovr: number; raw: Record<Key, number> }[] = [];

for (const seed of SEEDS) {
  const world = generateWorld({
    config: worlds.classic,
    seed,
    name: "fit",
    userCid: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  });
  for (const club of world.clubs) {
    const squad: Player[] = world.players.filter((p) => p.cid === club.cid);
    const input = teamInput(club, squad);
    const byPid = new Map(input.players.map((p) => [p.pid, p]));
    const formation = formationById(input.formation);
    const occupants = input.lineup.map((pid) => {
      const p = byPid.get(pid);
      if (!p) throw new Error(`missing ${pid}`);
      return { ratings: p.ratings, foot: p.foot };
    });
    const raw = rawRecipeQualities(formationPlan(formation), occupants);
    const xi = bestXi(
      squad.filter((p) => input.lineup.includes(p.pid)),
      formation,
    );
    const stp = Math.max(...occupants.map((o) => o.ratings[RATING_INDEX.stp] as number));
    samples.push({ ovr: xi.meanOvr, raw: { ...raw, setPieces: stp } });
  }
}

const fitted: Record<string, { offset: number; scale: number }> = {};
for (const key of [...RECIPE_NAMES, "setPieces"] as Key[]) {
  const xs = samples.map((s) => s.ovr);
  const ys = samples.map((s) => s.raw[key]);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * ((ys[i] as number) - my);
    sxx += (x - mx) ** 2;
  });
  const scale = sxy / sxx;
  const offset = my - scale * mx;
  fitted[key] = { offset: Math.round(offset * 100) / 100, scale: Math.round(scale * 1000) / 1000 };
  console.log(`${key.padEnd(10)} raw ≈ ${offset.toFixed(2)} + ${scale.toFixed(3)} × OVR`);
}

if (process.argv.includes("--write")) {
  const url = new URL("../src/worker/engine/teamRatings.ts", import.meta.url);
  let text = readFileSync(url, "utf8");
  for (const [key, { offset, scale }] of Object.entries(fitted)) {
    const pattern = new RegExp(`(  ${key}: \\{ offset: )[-\\d.]+(, scale: )[-\\d.]+( \\})`);
    if (!pattern.test(text)) throw new Error(`RATING_SCALE line for ${key} not found`);
    text = text.replace(pattern, `$1${offset}$2${scale}$3`);
  }
  writeFileSync(url, text);
  console.log("Wrote RATING_SCALE to src/worker/engine/teamRatings.ts");
}
