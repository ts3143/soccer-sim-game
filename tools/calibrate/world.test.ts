import { describe, expect, it } from "vitest";
import { worlds } from "../../src/common/config/worlds";
import { fingerprint, fingerprints } from "../../src/worker/fingerprint";
import { simulateWorld, type WorldRun } from "./world";

let run: WorldRun;
const perSeason: Promise<Record<string, string>>[] = [];

describe("season-loop harness", () => {
  it("plays a world for two seasons and measures every M3 target", { timeout: 120_000 }, () => {
    const seasons: number[] = [];
    run = simulateWorld(
      worlds.classic,
      "harness-smoke",
      2,
      ({ index, state, outcome, days, clubs, players }) => {
        seasons.push(index);
        perSeason.push(fingerprints({ state, outcome, days, clubs, players }));
      },
    );
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

  // Recorded from main (50616fc) before the Super League work: Classic seasons stay
  // exactly these (MILESTONES SL0). Re-record only for a change T approved. `clubs` and
  // `days` (its transactions name clubs) were re-recorded for T's club names (SPEC §17.3,
  // SL1): with the old names put back, both seasons were byte-for-byte main's.
  it("plays exactly the recorded Classic seasons", async () => {
    expect({
      seasons: await Promise.all(perSeason),
      run: await fingerprint({ ...run, seconds: 0 }),
    }).toEqual({
      seasons: [
        {
          state: "bb6dcf17c7035f5d",
          outcome: "152a8da91eb941d7",
          days: "8a371192be2a0b73",
          clubs: "3228230375a78028",
          players: "4b31d634b8e57381",
        },
        {
          state: "b514b20225c19870",
          outcome: "bacc2290e872d1b8",
          days: "7edb6ff4093dea7e",
          clubs: "a6f7162410243bd4",
          players: "b745b8d3091fa027",
        },
      ],
      run: "6880b302949e7d3e",
    });
  });
});
