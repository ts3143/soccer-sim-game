/**
 * One world for the tier report (`pnpm calibrate --world superLeague`), in its own process
 * so worlds run in parallel: `node --import tsx tools/calibrate/tiers-run.ts <seed>
 * <seasons> <world>` prints a TierRun as JSON.
 */
import { worldById } from "../../src/common/config/worlds";
import { applyOverrides } from "./overrides";
import { picksHeld, recordTierSeason, type TierRun, type TierSeason, tradeExploits } from "./tiers";
import { type SeasonReport, simulateWorld } from "./world";

applyOverrides();

const [seed = "calibrate-w0", seasons = "20", world = "superLeague"] = process.argv.slice(2);
const records: TierSeason[] = [];
let last: SeasonReport | null = null;
const run = simulateWorld(worldById(world), seed, Number(seasons), (report) => {
  records.push(recordTierSeason(report));
  last = report;
});
// SL5's exploit checks on the final world, as the next season would open.
const final = (last as SeasonReport | null)?.world;
const next = ((last as SeasonReport | null)?.state.season ?? 0) + 1;
const out: TierRun = {
  seed,
  seasons: records,
  activeAtStart: run.activeAtStart,
  activeAfter: run.activeAfter,
  retirements: run.retirements,
  exploits: final
    ? tradeExploits(final, next)
    : { starsChecked: 0, starsEqualled: 0, starsBought: 0, picksChecked: 0, picksOutOfOrder: 0 },
  picksHeld: final ? picksHeld(final) : { most: 0, none: 0 },
  seconds: run.seconds,
};
process.stdout.write(JSON.stringify(out));
