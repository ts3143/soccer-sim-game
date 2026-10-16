/**
 * Calibration harness (CLAUDE.md, SPEC §14): `pnpm calibrate [options] [--check]`.
 *
 * - Default: the match engine (M2): per-match targets on a neutral sample, each league's
 *   style-scaled checks, speed. Options: --matches N --seasons S --worlds W --seed X.
 * - `--world`: the season loop (M3): whole worlds played for many seasons with rotation,
 *   fatigue, injuries, development and turnover, against the season, development and
 *   stability targets. Options: --seasons S (20) --worlds W (3) --seed X.
 *
 * With --check, exits 1 if a gated check fails.
 */
if (process.argv.includes("--world")) await import("./world-report");
else await import("./engine");
