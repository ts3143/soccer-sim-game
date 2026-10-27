/**
 * Calibration harness (CLAUDE.md, SPEC §14): `pnpm calibrate [options] [--check]`.
 *
 * - Default: the match engine (M2): per-match targets on a neutral sample, each league's
 *   style-scaled checks, speed. Options: --matches N --seasons S --worlds W --seed X.
 * - `--world [<world id>]`: the season loop (M3): whole worlds (Classic unless named)
 *   played for many seasons with rotation, fatigue, injuries, development and turnover,
 *   against the season, development and stability targets. Options: --seasons S (20)
 *   --worlds W (3) --seed X. For the Super League (`--world superLeague`) the tier report
 *   instead (tiers-report.ts): mobility, yo-yo clubs, the rise.
 *
 * With --check, exits 1 if a gated check fails.
 */
import { worldOption } from "../world-option";

// Classic has its season-loop report; a world of tiers (the Super League) its tier report.
if (!process.argv.includes("--world")) await import("./engine");
else if (worldOption(process.argv.slice(2)).id === "classic") await import("./world-report");
else await import("./tiers-report");
