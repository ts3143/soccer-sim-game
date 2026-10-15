/**
 * One world for `pnpm calibrate --world`, in its own process so worlds run in parallel:
 * `node --import tsx tools/calibrate/world-run.ts <seed> <seasons>` prints a WorldRun as JSON.
 */
import { simulateWorld } from "./world";

const [seed = "calibrate-w0", seasons = "20"] = process.argv.slice(2);
process.stdout.write(JSON.stringify(simulateWorld(seed, Number(seasons))));
