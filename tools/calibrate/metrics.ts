/** Per-match and per-season metrics for the calibration harness. */
import type { SimulatedMatch } from "./runs";

export type PerMatchMetrics = Record<string, number>;

export function perMatch(matches: readonly SimulatedMatch[]): PerMatchMetrics {
  const n = matches.length;
  const results = matches.map((m) => m.result);
  const sum = (f: (r: (typeof results)[number]) => number) => results.reduce((s, r) => s + f(r), 0);
  const share = (f: (r: (typeof results)[number]) => boolean) => results.filter(f).length / n;
  const both = (key: keyof (typeof results)[number]["teams"][0]) =>
    sum((r) => r.teams[0][key] + r.teams[1][key]);
  const goals = (r: (typeof results)[number]) => r.homeGoals + r.awayGoals;
  const shots = both("shots");
  const played = results.flatMap((r) => r.players.filter((p) => p.minutes > 0));
  const teamMatches = results.flatMap((r) => r.teams);
  return {
    goals: sum(goals) / n,
    homeWinPct: share((r) => r.homeGoals > r.awayGoals),
    drawPct: share((r) => r.homeGoals === r.awayGoals),
    awayWinPct: share((r) => r.homeGoals < r.awayGoals),
    nilNilPct: share((r) => goals(r) === 0),
    fourPlusGoalsPct: share((r) => goals(r) >= 4),
    shotsTotal: shots / n,
    onTargetShare: both("shotsOnTarget") / shots,
    xgPerShot: both("xg") / shots,
    conversionRate: sum(goals) / shots,
    yellowCards: both("yellowCards") / n,
    redCards: both("redCards") / n,
    penaltiesAwarded: both("penaltiesAwarded") / n,
    penaltyConversion: both("penaltiesScored") / Math.max(1, both("penaltiesAwarded")),
    corners: both("corners") / n,
    fouls: both("fouls") / n,
    subsUsedPerTeam: both("subsUsed") / (2 * n),
    avgMatchRating: played.reduce((s, p) => s + p.rating, 0) / played.length,
    possessionInRange:
      teamMatches.filter((t) => t.possession >= 0.3 && t.possession <= 0.7).length /
      teamMatches.length,
    // For information
    injuriesPerTeam: both("injuries") / (2 * n),
    passesPerTeam: both("passes") / (2 * n),
    passCompletion: both("passesCompleted") / Math.max(1, both("passes")),
    ratingsBelow5: played.filter((p) => p.rating < 5).length / played.length,
    ratingsAbove85: played.filter((p) => p.rating > 8.5).length / played.length,
    ratings9Plus: played.filter((p) => p.rating >= 9).length / played.length,
  };
}

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
