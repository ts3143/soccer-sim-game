import { describe, expect, it } from "vitest";
import { RATING_INDEX } from "../../common/config/ratings";
import type { PlayerMatchStats } from "../../common/match";
import type { Club, Fixture, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { createSeason } from "./season";
import {
  applyMatch,
  currentCondition,
  isInjured,
  matchImportance,
  pickMatchday,
  resetForPreseason,
  trainingInjuries,
} from "./squads";

const world = generateWorld({
  seed: "squads-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const club = world.clubs[0] as Club;
const squadOf = (cid: number): Player[] =>
  structuredClone(world.players.filter((p) => p.cid === cid));
const DATE = "2026-09-12";
const someone = (): Player => {
  const p = structuredClone(squadOf(club.cid)[0] as Player);
  p.birthDate = "2000-01-01";
  return p;
};
const tired = (p: Player, condition: number, date: string) => {
  p.condition = condition;
  p.conditionDate = date;
  return p;
};

describe("condition", () => {
  it("is full when never set, and recovers with rest", () => {
    const p = someone();
    expect(currentCondition(p, DATE, 50)).toBe(100);
    tired(p, 70, "2026-09-12");
    expect(currentCondition(p, "2026-09-12", 50)).toBe(70);
    const midweek = currentCondition(p, "2026-09-16", 50);
    expect(midweek).toBeGreaterThan(84);
    expect(midweek).toBeLessThan(94);
    expect(currentCondition(p, "2026-09-19", 50)).toBeGreaterThan(midweek);
    expect(currentCondition(p, "2026-10-03", 50)).toBeGreaterThan(99);
  });

  it("recovers faster with a high Medical dial and good endurance, slower with age", () => {
    const p = tired(someone(), 70, "2026-09-12");
    const base = currentCondition(p, "2026-09-15", 50);
    expect(currentCondition(p, "2026-09-15", 90)).toBeGreaterThan(base);
    const fit = structuredClone(p);
    (fit.ratingsHistory.at(-1) as { ratings: number[] }).ratings[RATING_INDEX.end] = 95;
    const unfit = structuredClone(p);
    (unfit.ratingsHistory.at(-1) as { ratings: number[] }).ratings[RATING_INDEX.end] = 20;
    expect(currentCondition(fit, "2026-09-15", 50)).toBeGreaterThan(
      currentCondition(unfit, "2026-09-15", 50),
    );
    const veteran = { ...p, birthDate: "1991-01-01" };
    expect(currentCondition(veteran, "2026-09-15", 50)).toBeLessThan(base);
  });

  it("is set by the match and reset to full in preseason", () => {
    const p = someone();
    const fixture = (fid: number, date: string) => ({ fid, date, homeCid: 1, awayCid: 2 });
    applyMatch(p, { energyEnd: 0.63, injuryDays: 0 } as PlayerMatchStats, fixture(5, DATE));
    expect([p.condition, p.conditionDate]).toEqual([63, DATE]);
    expect(p.injuries).toBeUndefined();
    applyMatch(
      p,
      { energyEnd: 0.8, injuryDays: 10, side: 1 } as PlayerMatchStats,
      fixture(6, "2026-09-19"),
    );
    expect(p.injury).toEqual({ type: "Muscle strain", until: "2026-09-29" });
    // His history: the match and the opponent (he played away, so the home club).
    expect(p.injuries).toEqual([
      { date: "2026-09-19", type: "Muscle strain", days: 10, fid: 6, opponentCid: 1 },
    ]);
    expect(isInjured(p, "2026-09-28")).toBe(true);
    expect(isInjured(p, "2026-09-29")).toBe(false);
    expect(resetForPreseason(p, "2027-07-01")).toBe(true);
    expect(p).toMatchObject({ condition: 100, conditionDate: null, injury: null });
    p.injury = { type: "Serious injury", until: "2027-09-01" };
    resetForPreseason(p, "2027-07-01");
    expect(p.injury?.until).toBe("2027-09-01"); // long injuries carry on
  });
});

describe("training injuries", () => {
  const from = "2026-07-01";
  const run = (to: string, start = from, players = structuredClone(world.players)) => ({
    players,
    injured: trainingInjuries(world.clubs, players, start, to, "squads-test"),
  });

  it("gives the same injuries however the days are grouped", () => {
    const whole = run("2026-09-30");
    const split = structuredClone(world.players);
    const first = run("2026-08-10", from, split).injured;
    const second = run("2026-09-30", "2026-08-10", split).injured;
    expect([...first, ...second]).toEqual(whole.injured);
    expect(whole.injured.length).toBeGreaterThan(50); // ~60 clubs over three months
    for (const i of whole.injured) {
      const p = whole.players.find((x) => x.pid === i.pid) as Player;
      expect((p.injury?.until ?? "") > i.date).toBe(true);
      // In his history as a training injury: no fixture, no opponent.
      expect(p.injuries).toContainEqual(
        expect.objectContaining({ date: i.date, days: i.days, fid: null, opponentCid: null }),
      );
    }
    const recorded = whole.players.reduce((n, p) => n + (p.injuries?.length ?? 0), 0);
    expect(recorded).toBe(whole.injured.length);
  });

  it("hurts tired and injury-prone players more, and fewer with a high Medical dial", () => {
    const count = (edit: (p: Player) => void, medical = 50) => {
      const players = structuredClone(world.players).map((p) => {
        edit(p);
        return p;
      });
      const clubs = world.clubs.map((c) => ({ ...c, budget: { ...c.budget, medical } }));
      return trainingInjuries(clubs, players, from, "2027-06-30", "squads-test").length;
    };
    const normal = count((p) => (p.hidden.injuryProne = false));
    expect(count((p) => (p.hidden.injuryProne = true))).toBeGreaterThan(normal * 1.5);
    expect(count((p) => (p.hidden.injuryProne = false), 100)).toBeLessThan(normal);
    const tiredEveryDay = count((p) => {
      p.hidden.injuryProne = false;
      p.condition = 60;
      p.conditionDate = "2027-06-30"; // never recovers inside the window
    });
    expect(tiredEveryDay).toBeGreaterThan(normal * 1.5);
  });
});

describe("matchday squad", () => {
  const base = { date: DATE, importance: 1, nextImportance: 0 };
  const startersFrom = (squad: Player[], ctx: typeof base) => pickMatchday(club, squad, ctx).lineup;

  it("picks 11 fit players and 9 substitutes with today's condition", () => {
    const squad = squadOf(club.cid);
    const injured = squad.find((p) => p.status === "club") as Player;
    injured.injury = { type: "Knock", until: "2026-09-15" };
    tired(squad[3] as Player, 70, "2026-09-09");
    const pick = pickMatchday(club, squad, base);
    expect(pick.lineup).toHaveLength(11);
    expect(pick.bench).toHaveLength(9);
    expect([...pick.lineup, ...pick.bench]).not.toContain(injured.pid);
    const p3 = pick.players.find((p) => p.pid === squad[3]?.pid);
    if (p3) expect(p3.condition).toBeCloseTo(currentCondition(squad[3] as Player, DATE, 50), 5);
  });

  it("rests more regulars in small games and fewer in big ones", () => {
    const squad = squadOf(club.cid);
    const regulars = new Set(startersFrom(squad, base));
    for (const p of squad) if (regulars.has(p.pid)) tired(p, 84, DATE);
    const count = (importance: number, nextImportance = 0) =>
      startersFrom(squad, { date: DATE, importance, nextImportance }).filter((pid) =>
        regulars.has(pid),
      ).length;
    const cup = count(0.65);
    const league = count(1);
    const final = count(1.5);
    expect(cup).toBeLessThanOrEqual(league);
    expect(league).toBeLessThanOrEqual(final);
    expect(cup).toBeLessThan(final);
    // A final three days later: more regulars sit out this league match.
    expect(count(1, 1.5)).toBeLessThanOrEqual(league);
  });

  it("fills the squad with academy players 16+ only when fewer than 16 seniors are fit", () => {
    const squad = squadOf(club.cid);
    const academyIds = new Set(squad.filter((p) => p.status === "academy").map((p) => p.pid));
    const inSquad = (s: Player[]) => {
      const pick = pickMatchday(club, s, base);
      return [...pick.lineup, ...pick.bench].filter((pid) => academyIds.has(pid));
    };
    expect(inSquad(squad)).toEqual([]);
    const seniors = squad.filter((p) => p.status === "club");
    for (const p of seniors.slice(0, seniors.length - 14)) {
      p.injury = { type: "Knock", until: "2026-10-01" };
    }
    const called = inSquad(squad);
    expect(called.length).toBeGreaterThan(0);
    for (const pid of called) {
      const p = squad.find((x) => x.pid === pid) as Player;
      expect(Number(DATE.slice(0, 4)) - Number(p.birthDate.slice(0, 4))).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("match importance", () => {
  const state = createSeason({
    season: 2026,
    seed: "squads-test",
    clubs: world.clubs,
    lastFinish: new Map(),
    firstFid: 1,
  });
  const tables = () => [];
  const fake = (competition: string, round: string): Fixture => ({
    ...(state.fixtures[0] as Fixture),
    competition,
    round,
  });
  it("rates cup rounds, finals and play-offs above or below an ordinary league match", () => {
    const of = (f: Fixture) => matchImportance(state, f, f.homeCid, tables);
    expect(of(state.fixtures[0] as Fixture)).toBe(1);
    expect(of(fake("ENGCUP", "R1"))).toBeLessThan(1);
    expect(of(fake("ENGCUP", "Quarter-finals"))).toBeLessThan(1);
    expect(of(fake("ENGCUP", "Semi-finals"))).toBeGreaterThan(1);
    expect(of(fake("ENGCUP", "Final"))).toBe(1.5);
    expect(of(fake("ENG2-PO", "Semi-finals"))).toBe(1.5);
  });
});
