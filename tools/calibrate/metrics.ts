/** Per-match and per-season metrics for the calibration harness. */
import type { SimulatedMatch } from "./runs";

export { perMatch, type PerMatchMetrics } from "../../src/worker/engine/metrics";

export interface SeasonMetrics {
  championPoints: number;
  bottomPoints: number;
  topScorerGoals: number;
  topAssists: number;
  /** Matches between the final top six and bottom six that the top-six side lost. */
  top6LoseToBottom6Pct: number;
}

export function seasonMetrics(season: readonly SimulatedMatch[]): SeasonMetrics {
  const table = new Map<number, { points: number; gd: number; gf: number }>();
  const row = (cid: number) => {
    let r = table.get(cid);
    if (!r) table.set(cid, (r = { points: 0, gd: 0, gf: 0 }));
    return r;
  };
  const goals = new Map<number, number>();
  const assists = new Map<number, number>();
  for (const { homeCid, awayCid, result } of season) {
    const home = row(homeCid);
    const away = row(awayCid);
    home.gd += result.homeGoals - result.awayGoals;
    away.gd += result.awayGoals - result.homeGoals;
    home.gf += result.homeGoals;
    away.gf += result.awayGoals;
    if (result.homeGoals > result.awayGoals) home.points += 3;
    else if (result.homeGoals < result.awayGoals) away.points += 3;
    else {
      home.points++;
      away.points++;
    }
    for (const p of result.players) {
      goals.set(p.pid, (goals.get(p.pid) ?? 0) + p.goals);
      assists.set(p.pid, (assists.get(p.pid) ?? 0) + p.assists);
    }
  }
  const order = [...table.entries()]
    .sort(([, a], [, b]) => b.points - a.points || b.gd - a.gd || b.gf - a.gf)
    .map(([cid]) => cid);
  const top6 = new Set(order.slice(0, 6));
  const bottom6 = new Set(order.slice(-6));
  let meetings = 0;
  let upsets = 0;
  for (const { homeCid, awayCid, result } of season) {
    const homeTop = top6.has(homeCid) && bottom6.has(awayCid);
    const awayTop = top6.has(awayCid) && bottom6.has(homeCid);
    if (!homeTop && !awayTop) continue;
    meetings++;
    if (homeTop && result.homeGoals < result.awayGoals) upsets++;
    if (awayTop && result.awayGoals < result.homeGoals) upsets++;
  }
  return {
    championPoints: table.get(order[0] as number)?.points ?? 0,
    bottomPoints: table.get(order[order.length - 1] as number)?.points ?? 0,
    topScorerGoals: Math.max(...goals.values()),
    topAssists: Math.max(...assists.values()),
    top6LoseToBottom6Pct: meetings > 0 ? upsets / meetings : 0,
  };
}

export function averageSeasons(seasons: readonly SeasonMetrics[]): SeasonMetrics {
  const avg = (key: keyof SeasonMetrics) =>
    seasons.reduce((s, m) => s + m[key], 0) / seasons.length;
  return {
    championPoints: avg("championPoints"),
    bottomPoints: avg("bottomPoints"),
    topScorerGoals: avg("topScorerGoals"),
    topAssists: avg("topAssists"),
    top6LoseToBottom6Pct: avg("top6LoseToBottom6Pct"),
  };
}
