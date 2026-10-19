/**
 * In-memory coefficient overrides for tuning runs (A3 #3: coefficients live in code and the
 * harness may override them in memory). `--overrides '{"dev":{"declineScale":1.3}}'` is
 * passed to every world process through CALIBRATE_OVERRIDES and deep-merged here.
 */
import { BOARD } from "../../src/worker/club/board";
import { STANDING } from "../../src/worker/club/standing";
import { DEV } from "../../src/worker/core/development";
import { COEFFICIENTS } from "../../src/worker/engine/coefficients";
import { CEILING_HEADROOM } from "../../src/worker/generate/player";
import { FINANCE } from "../../src/worker/finance/finance";
import { YOUTH_QUALITY } from "../../src/worker/generate/youth";
import { MARKET } from "../../src/worker/market/market";
import { RENEWALS } from "../../src/worker/market/renewals";
import { SQUAD_COEFFICIENTS } from "../../src/worker/season/coefficients";
import { TURNOVER } from "../../src/worker/season/offseason";

const TARGETS: Record<string, object> = {
  dev: DEV,
  engine: COEFFICIENTS,
  youth: YOUTH_QUALITY,
  ceiling: CEILING_HEADROOM,
  squads: SQUAD_COEFFICIENTS,
  turnover: TURNOVER,
  finance: FINANCE,
  standing: STANDING,
  board: BOARD,
  market: MARKET,
  renewals: RENEWALS,
};

function merge(target: Record<string, unknown>, patch: Record<string, unknown>, path: string) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in target)) throw new Error(`Unknown coefficient ${path}.${key}`);
    const current = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object"
    ) {
      merge(current as Record<string, unknown>, value as Record<string, unknown>, `${path}.${key}`);
    } else {
      target[key] = value;
    }
  }
}

/** Applies CALIBRATE_OVERRIDES (JSON) if set; returns the parsed overrides. */
export function applyOverrides(json = process.env.CALIBRATE_OVERRIDES): Record<string, unknown> {
  if (!json) return {};
  const overrides = JSON.parse(json) as Record<string, Record<string, unknown>>;
  for (const [group, patch] of Object.entries(overrides)) {
    const target = TARGETS[group];
    if (!target) throw new Error(`Unknown coefficient group ${group}`);
    merge(target as Record<string, unknown>, patch, group);
  }
  return overrides;
}
