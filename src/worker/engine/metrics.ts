/**
 * Per-match averages over many results, as calibration_targets.json names them (goals,
 * home/draw/away shares, shots, cards, …). Shared by the calibration harness and the
 * Match lab page.
 */
import type { MatchResult } from "../../common/match";

export type PerMatchMetrics = Record<string, number>;

export function perMatch(results: readonly MatchResult[]): PerMatchMetrics {
  const n = results.length;
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
