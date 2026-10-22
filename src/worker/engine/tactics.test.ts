import { describe, expect, it } from "vitest";
import type { Club, Player, SliderSettings } from "../../common/schema";
import { generateWorld } from "../generate/world";
import {
  applyChanges,
  MatchChangeError,
  matchResult,
  ratingSoFar,
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

  it("move players between slots for free, and only players on the pitch", () => {
    const state = startMatch(watched("w5"));
    stepMatch(state, 10);
    const team = state.teams[0];
    const slots = () => team.slots.map((p) => p?.input.pid ?? null);
    const before = slots();
    const swapped = before.map((pid, i) => (i === 5 ? before[6] : i === 6 ? before[5] : pid));
    applyChanges(state, 0, { slots: swapped as number[] });
    expect(slots()).toEqual(swapped);
    expect(team.slots[5]?.slot).toBe(5);
    expect(team.stats.subsUsed).toBe(0);
    expect(team.stats.windowsUsed).toBe(0);

    const bench = team.bench[0]!.input.pid;
    const bad = [
      swapped.map((pid, i) => (i === 3 ? bench : pid)), // a sub without taking anyone off
      swapped.map((pid, i) => (i === 3 ? swapped[4] : pid)), // one player in two slots
      swapped.slice(0, 10), // not every slot
    ];
    for (const arrangement of bad) {
      expect(() => applyChanges(state, 0, { slots: arrangement as number[] })).toThrow(
        MatchChangeError,
      );
    }
  });

  it("after a red card, a sub comes on for another player and moves into the empty slot", () => {
    const state = startMatch(watched("w6"));
    stepMatch(state, 10);
    const team = state.teams[0];
    // Send off the player in slot 2 (a centre-back in the 4-4-2 fixtures use).
    const sentOff = team.slots[2]!;
    sentOff.sentOff = true;
    sentOff.slot = null;
    team.slots[2] = null;
    const position2 = team.plan.formation.slots[2]!.position;
    const out = team.slots[7]!.input.pid;
    const sub = team.bench[0]!;
    const arrangement = team.slots.map((p, i) =>
      i === 2 ? sub.input.pid : i === 7 ? null : (p?.input.pid ?? null),
    );
    applyChanges(state, 0, { subs: [{ outPid: out, inPid: sub.input.pid }], slots: arrangement });
    const at = (i: number) => team.slots[i];
    expect(at(2)?.input.pid).toBe(sub.input.pid);
    expect(at(7)).toBeNull();
    expect(team.slots.filter((p) => p !== null)).toHaveLength(10);
    expect(sub.stats.position).toBe(position2); // judged against the slot he ended up in
    expect(team.stats.subsUsed).toBe(1);
    stepMatch(state);
    expect(matchResult(state).players.some((p) => p.pid === sub.input.pid)).toBe(true);
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

describe("rating so far (the live board)", () => {
  it("starts near the centre, and at full time is every player's match rating", () => {
    const state = startMatch({
      ...prepareMatch(side(3), side(4), { seed: "so-far", style: NEUTRAL, watchedBy: 0 }),
    });
    stepMatch(state, 1);
    const early = state.teams[0].slots.map((p) => (p ? ratingSoFar(state, p) : null));
    for (const r of early) expect(Math.abs((r ?? 0) - 6.9)).toBeLessThan(0.6);
    expect(ratingSoFar(state, state.teams[0].bench[0]!)).toBeNull();
    stepMatch(state);
    const result = matchResult(state);
    for (const team of state.teams) {
      for (const p of team.all.filter((p) => p.onMinute !== null)) {
        expect(ratingSoFar(state, p)).toBe(
          result.players.find((r) => r.pid === p.input.pid)?.rating,
        );
      }
    }
  });
});
