/**
 * The headless tools' `--world <id>` option (SPEC §17.1): the world to generate or play,
 * Classic when not given. `pnpm calibrate --world` alone still means the season loop on
 * Classic, so a following `--flag` isn't taken as the world.
 */
import { type WorldConfig, worldById } from "../src/common/config/worlds";

export function worldOption(args: readonly string[]): WorldConfig {
  const value = args[args.indexOf("--world") + 1];
  const given = args.includes("--world") && value !== undefined && !value.startsWith("--");
  return worldById(given ? value : "classic");
}
