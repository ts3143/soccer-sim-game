import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { matchResult, simulateMatch, startMatch, stepMatch } from "./match";
import { teamInput } from "./prepare";
import type { MatchEvent, MatchInput, ShotStory } from "./types";

const competitions = worlds.classic.competitions;

const world = generateWorld({
  config: worlds.classic,
  seed: "engine-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const squadOf = (club: Club): Player[] => world.players.filter((p) => p.cid === club.cid);
const club = (cid: number) => world.clubs[cid] as Club;
const NEUTRAL = { chanceQuality: 1, foulRate: 1, directness: 0 };

function input(homeCid: number, awayCid: number, seed: string, feed = false): MatchInput {
  return {
    seed,
    home: teamInput(club(homeCid), squadOf(club(homeCid))),
    away: teamInput(club(awayCid), squadOf(club(awayCid))),
    neutralVenue: false,
    style: NEUTRAL,
    knockout: null,
    feed,
  };
}

const eng1 = world.clubs.filter((c) => c.leagueId === "ENG1");
const strongest = eng1.reduce((a, b) => (b.strengthTarget > a.strengthTarget ? b : a));
const weakest = eng1.reduce((a, b) => (b.strengthTarget < a.strengthTarget ? b : a));

describe("match engine: determinism", () => {
  it("gives the same result for the same seed, and a different one for another seed", () => {
    const a = simulateMatch(input(0, 1, "m1"));
    expect(simulateMatch(input(0, 1, "m1"))).toEqual(a);
    const others = ["m2", "m3", "m4"].map((seed) => simulateMatch(input(0, 1, seed)));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true);
  });

  it("is identical when paused and resumed, in any step size", () => {
    const whole = simulateMatch(input(2, 3, "pause"));
    for (const size of [1, 7, 50]) {
      const state = startMatch(input(2, 3, "pause"));
      while (!state.finished) stepMatch(state, size);
      expect(matchResult(state)).toEqual(whole);
    }
  });

  it("is unaffected by switching the live feed on", () => {
    const state = startMatch(input(4, 5, "feed", true));
    const events = [];
    while (!state.finished) events.push(...stepMatch(state, 3));
    const withFeed = matchResult(state);
    expect(withFeed).toEqual(simulateMatch(input(4, 5, "feed", false)));
    expect(events.filter((e) => e.type === "goal")).toHaveLength(
      withFeed.homeGoals + withFeed.awayGoals,
    );
    expect(events.some((e) => e.type === "shot")).toBe(true);
  });

  it("tells the commentary how each shot came about", () => {
    const shots: Extract<MatchEvent, { type: "shot" }>[] = [];
    const sides = new Map<number, number>();
    for (const seed of Array.from({ length: 10 }, (_, i) => `story-${i}`)) {
      const match = input(6, 7, seed, true);
      for (const [side, team] of [match.home, match.away].entries())
        for (const p of team.players) sides.set(p.pid, side);
      const state = startMatch(match);
      while (!state.finished)
        for (const e of stepMatch(state, 10)) if (e.type === "shot") shots.push(e);
    }
    const story = (pred: (s: ShotStory) => boolean) =>
      shots.filter((s) => s.story && pred(s.story));
    // Saves name the other side's keeper; blocks one of its defenders.
    for (const shot of shots.filter((s) => s.outcome === "saved" || s.outcome === "blocked")) {
      const by = shot.story?.stoppedBy;
      expect(by).toBeDefined();
      expect(sides.get(by as number)).toBe(1 - shot.side);
    }
    expect(
      shots
        .filter((s) => s.outcome === "goal" || s.outcome === "off")
        .some((s) => s.story?.stoppedBy !== undefined),
    ).toBe(false);
    // Set-piece headers name their taker; only headers come from set pieces.
    const setPieces = story((s) => s.setPiece !== undefined);
    expect(setPieces.length).toBeGreaterThan(0);
    for (const shot of setPieces) {
      expect(shot.shotType).toBe("header");
      const taker = shot.story?.setPiece?.takerPid;
      if (taker !== null && taker !== undefined) expect(sides.get(taker)).toBe(shot.side);
    }
    // Set pieces, penalties and direct free kicks carry no open-play build-up.
    for (const shot of [
      ...setPieces,
      ...shots.filter((s) => s.shotType === "penalty" || s.shotType === "freeKick"),
    ]) {
      expect(shot.story?.origin).toBeUndefined();
      expect(shot.story?.followUp).toBeUndefined();
      expect(shot.story?.flank).toBeUndefined();
    }
    expect(story((s) => s.flank !== undefined).length).toBeGreaterThan(0);
    expect(story((s) => s.origin === "longBall").length).toBeGreaterThan(0);
    expect(story((s) => s.followUp === true).length).toBeGreaterThan(0);
    // Flanks only on crosses and dribbles.
    for (const shot of story((s) => s.flank !== undefined))
      expect(["header", "dribble"]).toContain(shot.shotType);
  });
});

describe("match engine: plausibility", () => {
  it("produces a full match with consistent stats", () => {
    const result = simulateMatch(input(0, 1, "stats"));
    const [home, away] = result.teams;
    const best = Math.max(...result.players.map((p) => p.rating));
    expect(result.players.find((p) => p.pid === result.motm)?.rating).toBe(best);
    expect(home.goals).toBe(result.homeGoals);
    expect(away.goals).toBe(result.awayGoals);
    expect(home.possession + away.possession).toBeCloseTo(1, 6);
    expect(result.duration).toBeGreaterThanOrEqual(90 * 60);
    const scorers = result.players.reduce((s, p) => s + p.goals, 0);
    expect(scorers).toBe(result.homeGoals + result.awayGoals);
    expect(result.players.filter((p) => p.startedInSlot !== null)).toHaveLength(22);
  });

  it(
    "credits keepers with the post-shot xG they face, and rates full games ~6.9",
    { timeout: 60_000 },
    () => {
      const keepers: { prevented: number; faced: number; onTarget: number }[] = [];
      const ratings: number[] = [];
      for (let i = 0; i < 150; i++) {
        const r = simulateMatch(input(i % 20, (i + 7) % 20, `gk${i}`));
        for (const p of r.players) {
          if (p.minutes < 80) continue;
          ratings.push(p.rating);
          if (p.position !== "GK") continue;
          const prevented = p.psxgFaced - p.goalsConceded;
          keepers.push({ prevented, faced: p.psxgFaced, onTarget: p.saves + p.goalsConceded });
        }
      }
      for (const k of keepers) expect(k.faced > 0).toBe(k.onTarget > 0);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(Math.abs(mean(keepers.map((k) => k.prevented)))).toBeLessThan(0.25);
      expect(mean(ratings)).toBeGreaterThan(6.8);
      expect(mean(ratings)).toBeLessThan(7.05);
    },
  );

  it("lets stronger teams win more often", { timeout: 60_000 }, () => {
    let strongWins = 0;
    let weakWins = 0;
    for (let i = 0; i < 300; i++) {
      const homeStrong = i % 2 === 0;
      const r = simulateMatch(
        homeStrong
          ? input(strongest.cid, weakest.cid, `s${i}`)
          : input(weakest.cid, strongest.cid, `s${i}`),
      );
      const strongGoals = homeStrong ? r.homeGoals : r.awayGoals;
      const weakGoals = homeStrong ? r.awayGoals : r.homeGoals;
      if (strongGoals > weakGoals) strongWins++;
      if (weakGoals > strongGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });

  it(
    "uses each league's chance quality as an input (fewer goals at 0.88)",
    { timeout: 60_000 },
    () => {
      const eng2 = competitions.leagues.find((l) => l.id === "ENG2")?.styleModifiers;
      let neutralGoals = 0;
      let eng2Goals = 0;
      for (let i = 0; i < 300; i++) {
        const base = input(i % 20, (i + 7) % 20, `cq${i}`);
        const n = simulateMatch(base);
        const e = simulateMatch({ ...base, style: eng2 ?? NEUTRAL });
        neutralGoals += n.homeGoals + n.awayGoals;
        eng2Goals += e.homeGoals + e.awayGoals;
      }
      expect(eng2Goals).toBeLessThan(neutralGoals);
    },
  );
});
