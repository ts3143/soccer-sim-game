import { describe, expect, it } from "vitest";
import type { Club, Player, SliderSettings } from "../../common/schema";
import { generateWorld } from "../generate/world";
import {
  applyChanges,
  MatchChangeError,
  matchResult,
  simulateMatch,
  startMatch,
  stepMatch,
} from "./match";
import { prepareMatch } from "./prepare";
import type { MatchInput, MatchResult } from "./types";

const world = generateWorld({
  seed: "tactics-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const squad = (cid: number): Player[] => world.players.filter((p) => p.cid === cid);
const side = (cid: number) => ({ club: world.clubs[cid] as Club, squad: squad(cid) });
const NEUTRAL = { chanceQuality: 1, foulRate: 1, directness: 0 };
const SLOW = { timeout: 60_000 };
const ZERO: SliderSettings = { mentality: 0, pressing: 0, directness: 0 };

/** Home team with fixed sliders (no AI changes) against a fixed, neutral away team. */
function withSliders(sliders: SliderSettings, seed: string, home = 2, away = 7): MatchInput {
  const base = prepareMatch(side(home), side(away), { seed, style: NEUTRAL });
  return {
    ...base,
    home: { ...base.home, sliders, aiInGame: false },
    away: { ...base.away, sliders: ZERO, aiInGame: false },
  };
}

function totals(sliders: SliderSettings, n = 250) {
  const sum = { shotsFor: 0, shotsAgainst: 0, possession: 0, passes: 0, crosses: 0 };
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(withSliders(sliders, `t${i}`));
    sum.shotsFor += r.teams[0].shots;
    sum.shotsAgainst += r.teams[1].shots;
    sum.possession += r.teams[0].possession;
    sum.passes += r.teams[0].passes;
    sum.crosses += r.players.filter((p) => p.side === 0).reduce((s, p) => s + p.crosses, 0);
  }
  return sum;
}

describe("sliders move outcomes in the intended direction", () => {
  it("attacking mentality: more shots for and against", SLOW, () => {
    const neutral = totals(ZERO);
    const attacking = totals({ ...ZERO, mentality: 2 });
    expect(attacking.shotsFor).toBeGreaterThan(neutral.shotsFor);
    expect(attacking.shotsAgainst).toBeGreaterThan(neutral.shotsAgainst);
  });

  it("short passing keeps the ball and passes more; direct crosses more", SLOW, () => {
    const short = totals({ ...ZERO, directness: -2 });
    const direct = totals({ ...ZERO, directness: 2 });
    expect(short.possession).toBeGreaterThan(direct.possession);
    expect(short.passes).toBeGreaterThan(direct.passes);
    expect(direct.crosses).toBeGreaterThan(short.crosses);
  });
});

describe("the user's changes during a watched match", () => {
  const watched = (seed: string) => ({
    ...prepareMatch(side(0), side(1), { seed, style: NEUTRAL, watchedBy: 0 }),
  });

  it("leave the result unchanged when empty, at any pause", () => {
    const untouched = simulateMatch(watched("w1"));
    const state = startMatch(watched("w1"));
    while (!state.finished) {
      applyChanges(state, 0, {});
      stepMatch(state, 5);
    }
    expect(matchResult(state)).toEqual(untouched);
  });

  it("use one window per pause during play, none at half-time", () => {
    const state = startMatch(watched("w2"));
    const bench = state.teams[0].bench.map((p) => p.input.pid);
    const starters = () => state.teams[0].slots.filter((p) => p !== null).map((p) => p.input.pid);
    stepMatch(state, 20); // first half, during play
    applyChanges(state, 0, {
      subs: [
        { outPid: starters()[5]!, inPid: bench[1]! },
        { outPid: starters()[6]!, inPid: bench[2]! },
      ],
    });
    expect(state.teams[0].stats.windowsUsed).toBe(1);
    expect(state.teams[0].stats.subsUsed).toBe(2);
    while (state.period === "first") stepMatch(state, 1); // now at half-time
    applyChanges(state, 0, { subs: [{ outPid: starters()[7]!, inPid: bench[3]! }] });
    expect(state.teams[0].stats.windowsUsed).toBe(1); // half-time is free
    stepMatch(state, 3);
    applyChanges(state, 0, { subs: [{ outPid: starters()[8]!, inPid: bench[4]! }] });
    stepMatch(state, 3);
    applyChanges(state, 0, { subs: [{ outPid: starters()[9]!, inPid: bench[5]! }] });
    expect(state.teams[0].stats.windowsUsed).toBe(3);
    expect(() =>
      applyChanges(state, 0, { subs: [{ outPid: starters()[4]!, inPid: bench[6]! }] }),
    ).toThrow(MatchChangeError); // 5 subs used
  });

  it("refuse a fourth window and invalid players", () => {
    const state = startMatch(watched("w3"));
    const bench = state.teams[0].bench.map((p) => p.input.pid);
    const starter = (i: number) => state.teams[0].slots[i]!.input.pid;
    for (let w = 0; w < 3; w++) {
      stepMatch(state, 4);
      applyChanges(state, 0, { subs: [{ outPid: starter(w + 3), inPid: bench[w + 1]! }] });
    }
    stepMatch(state, 4);
    expect(() =>
      applyChanges(state, 0, { subs: [{ outPid: starter(8), inPid: bench[5]! }] }),
    ).toThrow("No substitution windows left");
    expect(() => applyChanges(state, 0, { subs: [{ outPid: 999999, inPid: bench[5]! }] })).toThrow(
      MatchChangeError,
    );
  });

  it("switch formation with the keeper still in goal, and change sliders", () => {
    const state = startMatch(watched("w4"));
    stepMatch(state, 10);
    const keeper = state.teams[0].slots[0]!.input.pid;
    applyChanges(state, 0, { formation: "5-3-2", sliders: { mentality: -1 } });
    const team = state.teams[0];
    expect(team.plan.formation.id).toBe("5-3-2");
    expect(team.slots.filter((p) => p !== null)).toHaveLength(11);
    expect(
      team.slots[team.plan.formation.slots.findIndex((s) => s.position === "GK")]?.input.pid,
    ).toBe(keeper);
    expect(team.sliders.mentality).toBe(-1);
    expect(() => applyChanges(state, 0, { sliders: { pressing: 3 } })).toThrow(MatchChangeError);
    stepMatch(state);
    expect(matchResult(state).teams[0].goals).toBeGreaterThanOrEqual(0);
  });
});

describe("box score", () => {
  it("adds up: player totals match team totals, ratings sit in range", () => {
    for (let i = 0; i < 30; i++) {
      const r: MatchResult = simulateMatch(
        prepareMatch(side(i % 20), side((i + 1) % 20), { seed: `b${i}`, style: NEUTRAL }),
      );
      for (const s of [0, 1] as const) {
        const own = r.players.filter((p) => p.side === s);
        const t = r.teams[s];
        expect(own.reduce((a, p) => a + p.goals, 0)).toBe(t.goals);
        expect(own.reduce((a, p) => a + p.shots, 0)).toBe(t.shots);
        expect(own.reduce((a, p) => a + p.passes, 0)).toBe(t.passes);
        expect(t.passesCompleted).toBeLessThanOrEqual(t.passes);
        expect(own.reduce((a, p) => a + p.yellowCards, 0)).toBe(t.yellowCards);
        const keeper = own.find((p) => p.position === "GK" && p.startedInSlot !== null);
        expect(keeper?.cleanSheet).toBe(
          r.teams[s === 0 ? 1 : 0].goals === 0 && (keeper?.minutes ?? 0) >= 60 ? 1 : 0,
        );
      }
      expect(r.players.every((p) => p.rating >= 3 && p.rating <= 10)).toBe(true);
    }
  });
});
