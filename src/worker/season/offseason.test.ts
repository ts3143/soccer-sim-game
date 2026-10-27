import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { ageOn as wholeYears, exactAge } from "../../common/dates";
import type { Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import {
  academyDecisions,
  developmentUpdate,
  endOfSeasonTurnover,
  type LoopWorld,
  seasonAwards,
  type SeasonLine,
  startingReputation,
  freeAgencyTopUp,
  preseasonTurnover,
  promoteToSquadSize,
  youthIntake,
} from "./offseason";
import { runDays } from "./runner";
import { applyMoves, createSeason, seasonOutcome } from "./season";

const competitions = worlds.classic.competitions;

const SLOW = { timeout: 120_000 };
const SEED = "offseason-test";
const generated = generateWorld({
  config: worlds.classic,
  seed: SEED,
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});

function freshWorld(): LoopWorld {
  const players = structuredClone(generated.players);
  let pid = Math.max(...players.map((p) => p.pid)) + 1;
  return {
    config: worlds.classic,
    clubs: structuredClone(generated.clubs),
    players,
    reputation: startingReputation(worlds.classic.clubs),
    clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
    userCid: 0,
    seed: SEED,
    nextPid: () => pid++,
  };
}

/** A copy of a world to try a step on (structuredClone can't copy its pid counter). */
function copyOf(w: LoopWorld): LoopWorld {
  const players = structuredClone(w.players);
  let pid = Math.max(...players.map((p) => p.pid)) + 1;
  return {
    ...w,
    clubs: structuredClone(w.clubs),
    players,
    reputation: new Map(w.reputation),
    clubSeasons: new Map(structuredClone([...w.clubSeasons])),
    nextPid: () => pid++,
  };
}

// One season played with the real season loop (winter development included).
const world = freshWorld();
const before = new Map(world.players.map((p) => [p.pid, structuredClone(p)]));
const state = createSeason({
  config: competitions,
  season: 2026,
  seed: SEED,
  clubs: world.clubs,
  lastFinish: new Map(),
  firstFid: 1,
});
const days = runDays(world, state, "2026-07-01", { limit: null });
const outcome = seasonOutcome(state, competitions);
const ageOn = (p: Player, date: string) => exactAge(p.birthDate, date);

describe("development during the season", () => {
  it("runs the winter update on 1 January from the first half's minutes", SLOW, () => {
    expect(days.events.some((e) => e.kind === "winterUpdate" && e.date === "2027-01-01")).toBe(
      true,
    );
    const p = world.players.find((x) => x.status === "club") as Player;
    expect(p.ratingsHistory.map((r) => r.date)).toEqual(["2026-07-01", "2027-01-01"]);
    // The tally restarted on 1 January but the season's minutes carry on.
    const played = world.players.filter(
      (x) => (x.devTally?.seasonMinutes ?? 0) > (x.devTally?.minutes ?? 0),
    );
    expect(played.length).toBeGreaterThan(500);
  });

  it("grows well-played young players faster than benched ones; veterans decline", SLOW, () => {
    const summer = copyOf(world);
    developmentUpdate(summer, state, "2027-07-01", true);
    const change = (p: Player) => p.ovr - (before.get(p.pid)?.ovr ?? p.ovr);
    const seniors = summer.players.filter((p) => p.status === "club");
    const young = seniors.filter(
      (p) => ageOn(p, "2026-07-01") >= 18 && ageOn(p, "2026-07-01") < 22,
    );
    const minutes = (p: Player) =>
      world.players.find((x) => x.pid === p.pid)?.devTally?.seasonMinutes ?? 0;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const regulars = young.filter((p) => minutes(p) > 2000);
    const benched = young.filter((p) => minutes(p) < 300);
    expect(regulars.length).toBeGreaterThan(5);
    expect(benched.length).toBeGreaterThan(5);
    expect(mean(regulars.map(change))).toBeGreaterThan(mean(benched.map(change)));
    const veterans = seniors.filter((p) => ageOn(p, "2026-07-01") >= 33);
    expect(mean(veterans.map(change))).toBeLessThan(0);
    for (const p of summer.players.filter((x) => x.status !== "retired")) {
      expect(p.ratingsHistory).toHaveLength(3);
      expect(p.pot).toBeGreaterThanOrEqual(p.ovr);
      expect(p.hidden.ceiling).toBeGreaterThanOrEqual(p.ovr);
      expect(p.devTally).toEqual({ minutes: 0, appearances: 0, ratingTotal: 0, seasonMinutes: 0 });
    }
  });
});

describe("the end of the season", () => {
  it("retires mostly players in their mid-30s, keepers later, and logs it", SLOW, () => {
    const end = copyOf(world);
    const log = endOfSeasonTurnover(end, 2026, "2027-06-01");
    const retired = end.players.filter((p) => log.changed.has(p.pid));
    expect(retired.length).toBeGreaterThan(30);
    expect(
      retired.every((p) => p.status === "retired" && p.cid === null && p.retiredSeason === 2026),
    ).toBe(true);
    const ages = retired
      .filter((p) => before.get(p.pid)?.status !== "freeAgent")
      .map((p) => ageOn(p, "2027-06-01"));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(31);
    expect(log.transactions.filter((t) => t.type === "retirement")).toHaveLength(retired.length);
  });

  it("gives every honour and award once per competition", SLOW, () => {
    const lines: SeasonLine[] = [];
    const totals = new Map<string, SeasonLine>();
    for (const { fixture, result } of days.played) {
      for (const p of result.players) {
        const cid = p.side === 0 ? fixture.homeCid : fixture.awayCid;
        const key = `${p.pid}/${fixture.competition}`;
        const line = totals.get(key) ?? {
          pid: p.pid,
          cid,
          competition: fixture.competition,
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          ratingTotal: 0,
        };
        line.appearances++;
        line.minutes += p.minutes;
        line.goals += p.goals;
        line.assists += p.assists;
        line.ratingTotal += p.rating;
        totals.set(key, line);
      }
    }
    lines.push(...totals.values());
    const awards = seasonAwards(state, outcome, world.clubs, world.players, lines, competitions);
    for (const league of competitions.leagues) {
      const of = (type: string) =>
        awards.filter((a) => a.competition === league.id && a.type === type);
      expect(of("champions")).toHaveLength(1);
      expect(of("playerOfTheYear")).toHaveLength(1);
      expect(of("teamOfTheSeason")).toHaveLength(11);
      const boot = of("goldenBoot")[0];
      const most = Math.max(
        ...lines.filter((l) => l.competition === league.id).map((l) => l.goals),
      );
      expect(lines.find((l) => l.pid === boot?.pid && l.competition === league.id)?.goals).toBe(
        most,
      );
      const provider = of("topAssists");
      expect(provider).toHaveLength(1);
      const leagueLines = lines.filter((l) => l.competition === league.id);
      const mostAssists = Math.max(...leagueLines.map((l) => l.assists));
      const tied = leagueLines.filter((l) => l.assists === mostAssists);
      // Ties go to the fewer minutes, as for the Golden Boot.
      expect(provider[0]?.pid).toBe(
        tied.sort((a, b) => a.minutes - b.minutes || a.pid - b.pid)[0]?.pid,
      );
    }
    expect(awards.filter((a) => a.type === "cupWinner")).toHaveLength(2);
    expect(awards.filter((a) => a.type === "relegated")).toHaveLength(3);
    expect(awards.filter((a) => a.type === "promoted")).toHaveLength(3);
    expect(awards.filter((a) => a.type === "playoffWinner")).toHaveLength(1);
    expect(awards.every((a) => a.name.length > 0)).toBe(true);
  });
});

describe("preseason", () => {
  const pre = copyOf(world);
  applyMoves(pre.clubs, outcome.moves);
  const date = "2027-07-01";

  it("brings no youths in a world without academies (the Super League)", () => {
    const world = generateWorld({
      config: worlds.superLeague,
      seed: SEED,
      name: "t",
      userCid: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    let pid = Math.max(...world.players.map((p) => p.pid)) + 1;
    const loop: LoopWorld = {
      config: worlds.superLeague,
      clubs: world.clubs,
      players: world.players,
      reputation: startingReputation(worlds.superLeague.clubs),
      clubSeasons: new Map(world.clubSeasons.map((r) => [r.cid, r])),
      userCid: 0,
      seed: SEED,
      nextPid: () => pid++,
    };
    const log = preseasonTurnover(loop, 2027, "2027-07-01");
    expect(log.added).toEqual([]);
    expect(loop.players.some((p) => p.status === "academy")).toBe(false);
  });

  it("tops AI squads up to 22 from free agents where players move by trades", () => {
    const sl = generateWorld({
      config: worlds.superLeague,
      seed: SEED,
      name: "t",
      userCid: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    let pid = Math.max(...sl.players.map((p) => p.pid)) + 1;
    const loop: LoopWorld = {
      config: worlds.superLeague,
      clubs: sl.clubs,
      players: sl.players,
      reputation: startingReputation(worlds.superLeague.clubs),
      clubSeasons: new Map(sl.clubSeasons.map((r) => [r.cid, r])),
      userCid: 0,
      seed: SEED,
      nextPid: () => pid++,
    };
    const seniors = (cid: number) =>
      loop.players.filter((p) => p.cid === cid && p.status === "club");
    // Clubs 0 (the user's) and 1 lose players to 18.
    for (const cid of [0, 1]) {
      for (const p of seniors(cid).slice(18)) {
        p.status = "freeAgent";
        p.cid = null;
        p.contract = null;
      }
    }
    const log = freeAgencyTopUp(loop, 2026, "2026-07-01");
    expect(seniors(1)).toHaveLength(22);
    expect(seniors(0)).toHaveLength(18); // the user signs his own
    const signed = log.transactions.filter((t) => t.cids[0] === 1);
    expect(signed).toHaveLength(4);
    expect(signed.every((t) => t.type === "freeAgent")).toBe(true);
    for (const pid of signed.map((t) => t.pids[0])) {
      const p = loop.players.find((x) => x.pid === pid);
      expect(p?.contract?.expires).toMatch(/^202[78]-06-30$/);
      expect(p?.contract?.wage).toBeGreaterThan(0);
    }
  });

  it("brings 3–6 youths aged 15–16 into every academy", () => {
    const log = youthIntake(pre, 2027, date);
    for (const club of pre.clubs) {
      const intake = log.added.filter((p) => p.cid === club.cid);
      expect(intake.length).toBeGreaterThanOrEqual(3);
      expect(intake.length).toBeLessThanOrEqual(6);
    }
    for (const p of log.added) {
      expect(p.status).toBe("academy");
      expect([15, 16]).toContain(wholeYears(p.birthDate, date));
      expect(p.pot).toBeGreaterThanOrEqual(p.ovr);
    }
    // Local lads: about half of the home-country youths are born in the club's city.
    const clubOf = (cid: number | null) => pre.clubs.find((c) => c.cid === cid);
    const home = log.added.filter((p) => clubOf(p.cid)?.country === p.nationality);
    const local = home.filter((p) => p.birthplace === clubOf(p.cid)?.city);
    expect(Math.abs(local.length / home.length - 0.5)).toBeLessThan(0.12);
  });

  it("promotes or releases every academy player of 18, and logs it", () => {
    const log = academyDecisions(pre, 2027, date);
    const left = pre.players.filter((p) => p.status === "academy" && ageOn(p, date) >= 18);
    expect(left).toEqual([]);
    const promoted = log.transactions.filter((t) => t.type === "academyPromotion");
    const released = log.transactions.filter((t) => t.type === "release");
    expect(promoted.length + released.length).toBeGreaterThan(20);
    for (const t of promoted) {
      const p = pre.players.find((x) => x.pid === t.pids[0]) as Player;
      expect(p.status).toBe("club");
      expect(p.contract?.expires).toBe("2030-06-30");
    }
    for (const t of released) {
      const p = pre.players.find((x) => x.pid === t.pids[0]) as Player;
      expect(p).toMatchObject({ status: "freeAgent", cid: null, freeAgentSince: date });
    }
  });

  it("has AI clubs promote academy prospects up to 22 seniors, never the user's club", () => {
    // Make room: three clubs lose seniors (the first is the user's).
    for (const club of pre.clubs.slice(0, 3)) {
      const seniors = pre.players.filter((p) => p.cid === club.cid && p.status === "club");
      for (const p of seniors.slice(0, 6)) {
        p.status = "retired";
        p.cid = null;
      }
    }
    const seniorsOf = (cid: number) =>
      pre.players.filter((p) => p.cid === cid && p.status === "club").length;
    const userBefore = seniorsOf(pre.userCid);
    const log = promoteToSquadSize(pre, 2027, date);
    expect(seniorsOf(pre.userCid)).toBe(userBefore);
    for (const club of pre.clubs.slice(1, 3)) {
      const academy = pre.players.filter(
        (p) => p.cid === club.cid && p.status === "academy" && exactAge(p.birthDate, date) >= 17,
      );
      expect(seniorsOf(club.cid) >= 22 || academy.length === 0).toBe(true);
    }
    expect(log.transactions.every((t) => t.type === "academyPromotion")).toBe(true);
    expect(log.transactions.length).toBeGreaterThan(0);
  });
});
