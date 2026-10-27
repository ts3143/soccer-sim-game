/**
 * One world for the tier report (`pnpm calibrate --world superLeague`), in its own process
 * so worlds run in parallel: `node --import tsx tools/calibrate/tiers-run.ts <seed>
 * <seasons> <world>` prints a TierRun as JSON.
 */
import { worldById } from "../../src/common/config/worlds";
import { recordTierSeason, type TierRun, type TierSeason } from "./tiers";
import { simulateWorld } from "./world";

const [seed = "calibrate-w0", seasons = "20", world = "superLeague"] = process.argv.slice(2);
const records: TierSeason[] = [];
const run = simulateWorld(worldById(world), seed, Number(seasons), (report) =>
  records.push(recordTierSeason(report)),
);
const out: TierRun = {
  seed,
  seasons: records,
  activeAtStart: run.activeAtStart,
  activeAfter: run.activeAfter,
  retirements: run.retirements,
  seconds: run.seconds,
};
process.stdout.write(JSON.stringify(out));
