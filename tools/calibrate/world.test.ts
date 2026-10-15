import { describe, expect, it } from "vitest";
import { simulateWorld } from "./world";

describe("season-loop harness", () => {
  it("plays a world for two seasons and measures every M3 target", { timeout: 120_000 }, () => {
    const seasons: number[] = [];
    const run = simulateWorld("harness-smoke", 2, ({ index }) => seasons.push(index));
    expect(seasons).toEqual([0, 1]);
    expect(run.seasons).toHaveLength(2);
    expect(run.championsENG1).toHaveLength(2);
    expect(run.activeAfter).toHaveLength(2);
    for (const metrics of run.seasons) {
      for (const key of [
        "championPointsENG1",
        "bottomPointsENG1",
        "topScorerGoals",
        "topAssists",
        "injuredPerSquadAtOnce",
        "top6LoseToBottom6Pct",
        "topClubStarterMinutesShare",
        "wellPlayed18to21OvrGainPerYear",
        "benched18to21OvrGainPerYear",
        "age33plusOvrLossPerYear",
        "wonderkidsPerLeaguePerSeason",
      ]) {
        expect(Number.isFinite(metrics[key])).toBe(true);
      }
    }
    expect(run.retirements.length).toBeGreaterThan(20);
    expect(run.potChecked).toBeGreaterThan(50);
    // Plain data: it crosses process boundaries as JSON.
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});
