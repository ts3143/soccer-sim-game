import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, Fixture } from "../../common/schema";
import type { LeagueConfig } from "../../common/config/competitions";
import { generateWorld } from "../generate/world";
import { tableZone } from "../views/common";
import { seasonAwards } from "./offseason";
import { metInPlayoff } from "../club/board";
import { fullStrengthPlay } from "./play";
import {
  applyMoves,
  createSeason,
  finishesOf,
  knockoutRules,
  nextMatchDate,
  playDate,
  playoffId,
  playRest,
  seasonOutcome,
  type SeasonState,
} from "./season";

const competitions = worlds.classic.competitions;

const SLOW = { timeout: 120_000 };
const world = generateWorld({
  config: worlds.classic,
  seed: "season-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const play = fullStrengthPlay(world.clubs, world.players);
const start = (clubs: readonly Club[] = world.clubs, season = 2026, lastFinish = new Map()) =>
  createSeason({
    config: competitions,
    season,
    seed: "season-test",
    clubs,
    lastFinish,
    firstFid: 1,
  });

const leagueOf = new Map(world.clubs.map((c) => [c.cid, c.leagueId]));
const byRound = (state: SeasonState, competition: string, round: string) =>
  state.fixtures.filter((f) => f.competition === competition && f.round === round);
const clubsIn = (fixtures: readonly Fixture[]) => fixtures.flatMap((f) => [f.homeCid, f.awayCid]);

// One full season, shared by the tests below.
const state = start();
playRest(state, play, competitions);
const outcome = seasonOutcome(state, competitions);

describe("a full season", () => {
  it("plays every fixture, with no club playing twice on a date", SLOW, () => {
    expect(nextMatchDate(state)).toBeNull();
    expect(state.fixtures.every((f) => f.result !== null)).toBe(true);
    const seen = new Set<string>();
    for (const f of state.fixtures) {
      for (const cid of [f.homeCid, f.awayCid]) {
        const key = `${f.date}/${cid}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    const leagueIds = new Set(competitions.leagues.map((l) => l.id));
    const league = state.fixtures.filter((f) => leagueIds.has(f.competition));
    expect(league).toHaveLength(380 + 552 + 306);
  });

  it("runs the English cup: ENG2 in round 1, ENG1 joins in round 2, a neutral final", () => {
    const [r1, r2, r3, qf, sf, final] = competitions.cups[0]?.rounds ?? [];
    const round1 = byRound(state, "ENGCUP", r1 as string);
    expect(round1).toHaveLength(12);
    expect(clubsIn(round1).every((c) => leagueOf.get(c) === "ENG2")).toBe(true);
    const round2 = byRound(state, "ENGCUP", r2 as string);
    expect(round2).toHaveLength(16);
    const winners1 = round1.map((f) => f.result?.winnerCid);
    const eng1 = world.clubs.filter((c) => c.leagueId === "ENG1").map((c) => c.cid);
    expect(new Set(clubsIn(round2))).toEqual(new Set([...winners1, ...eng1]));
    expect(byRound(state, "ENGCUP", r3 as string)).toHaveLength(8);
    expect(byRound(state, "ENGCUP", qf as string)).toHaveLength(4);
    expect(byRound(state, "ENGCUP", sf as string)).toHaveLength(2);
    const finals = byRound(state, "ENGCUP", final as string);
    expect(finals).toHaveLength(1);
    expect(finals[0]?.neutral).toBe(true);
    expect(byRound(state, "ENGCUP", sf as string).every((f) => !f.neutral)).toBe(true);
    // Every tie has a winner, level ties went to extra time, and some to penalties.
    const ties = state.fixtures.filter(
      (f) => f.competition === "ENGCUP" || f.competition === "GERCUP",
    );
    for (const f of ties) {
      const r = f.result;
      expect([f.homeCid, f.awayCid]).toContain(r?.winnerCid);
      if (r && r.homeGoals === r.awayGoals) expect(r.penalties).not.toBeNull();
    }
    expect(outcome.cupWinners.ENGCUP).toBe(finals[0]?.result?.winnerCid);
  });

  it("puts the 4 lowest-strength GER1 clubs in the German cup's preliminary round in season 1", () => {
    const rounds = competitions.cups[1]?.rounds ?? [];
    const prelim = byRound(state, "GERCUP", rounds[0] as string);
    const weakest = world.clubs
      .filter((c) => c.leagueId === "GER1")
      .sort((a, b) => a.strengthTarget - b.strengthTarget || a.cid - b.cid)
      .slice(0, 4)
      .map((c) => c.cid);
    expect(new Set(clubsIn(prelim))).toEqual(new Set(weakest));
    const last16 = byRound(state, "GERCUP", rounds[1] as string);
    expect(last16).toHaveLength(8);
    expect(clubsIn(last16).filter((c) => weakest.includes(c))).toHaveLength(2);
  });

  it("runs the ENG2 play-offs with the real format", () => {
    const table = outcome.tables.ENG2 ?? [];
    const at = (pos: number) => table[pos - 1]?.cid as number;
    const id = playoffId("ENG2");
    const elim = byRound(state, id, "Eliminators");
    expect(elim.map((f) => [f.homeCid, f.awayCid])).toEqual([
      [at(5), at(8)],
      [at(6), at(7)],
    ]);
    const winners = elim.map((f) => f.result?.winnerCid as number);
    const pos = (cid: number) => table.findIndex((r) => r.cid === cid) + 1;
    const [best, worst] = [...winners].sort((a, b) => pos(a) - pos(b));
    const semis = byRound(state, id, "Semi-finals");
    const leg2 = semis.filter((f) => f.leg === 2);
    // Higher seed hosts the second leg: 3rd v lowest-seeded winner, 4th v highest-seeded.
    expect(leg2.map((f) => [f.homeCid, f.awayCid])).toEqual([
      [at(3), worst],
      [at(4), best],
    ]);
    const leg1 = semis.filter((f) => f.leg === 1);
    expect(leg1.map((f) => [f.awayCid, f.homeCid])).toEqual(
      leg2.map((f) => [f.homeCid, f.awayCid]),
    );
    expect(leg1.every((f) => f.result?.winnerCid === null)).toBe(true);
    const [final] = byRound(state, id, "Final");
    expect(final?.neutral).toBe(true);
    expect(new Set([final?.homeCid, final?.awayCid])).toEqual(
      new Set(leg2.map((f) => f.result?.winnerCid)),
    );
    expect(outcome.playoffWinners.ENG2).toEqual([final?.result?.winnerCid]);
    // Dates: eliminators after the league's last round, final last.
    const lastLeague = state.calendar.leagues.ENG2?.at(-1)?.date ?? "";
    expect(elim.every((f) => f.date > lastLeague)).toBe(true);
    expect(final?.date).toBe(state.calendar.playoffs.ENG2?.at(-1)?.date);
  });

  it("feeds the first leg's score into the second leg, from the second leg's home side", () => {
    const leg2 = state.fixtures.find((f) => f.leg === 2) as Fixture;
    const leg1 = state.fixtures.find(
      (f) => f.leg === 1 && f.homeCid === leg2.awayCid && f.awayCid === leg2.homeCid,
    );
    expect(knockoutRules(state, leg2)).toEqual({
      extraTime: true,
      penalties: true,
      firstLeg: { home: leg1?.result?.awayGoals, away: leg1?.result?.homeGoals },
    });
    expect(knockoutRules(state, leg1 as Fixture)).toBeNull();
  });

  it("relegates ENG1's bottom 3 and promotes ENG2's top 2 plus the play-off winner", SLOW, () => {
    const eng1 = outcome.tables.ENG1 ?? [];
    const eng2 = outcome.tables.ENG2 ?? [];
    const down = outcome.moves.filter((m) => m.reason === "relegated").map((m) => m.cid);
    expect(down).toEqual(eng1.slice(-3).map((r) => r.cid));
    const up = outcome.moves.filter((m) => m.reason === "promoted").map((m) => m.cid);
    expect(up).toEqual(eng2.slice(0, 2).map((r) => r.cid));
    const viaPlayoffs = outcome.moves.filter((m) => m.reason === "playoffs");
    expect(viaPlayoffs).toHaveLength(1);
    expect(eng2.slice(2, 8).map((r) => r.cid)).toContain(viaPlayoffs[0]?.cid);
    expect(outcome.moves.every((m) => m.from.startsWith("ENG"))).toBe(true);

    // Season 2: the new leagues and last season's table feed the German preliminary round.
    const clubs = world.clubs.map((c) => ({ ...c }));
    applyMoves(clubs, outcome.moves);
    expect(clubs.filter((c) => c.leagueId === "ENG1")).toHaveLength(20);
    expect(clubs.filter((c) => c.leagueId === "ENG2")).toHaveLength(24);
    const next = start(clubs, 2027, finishesOf(outcome));
    const promotedCid = up[0] as number;
    expect(next.leagueClubs.ENG1).toContain(promotedCid);
    const prelim = next.fixtures.filter((f) => f.competition === "GERCUP");
    const bottom4 = (outcome.tables.GER1 ?? []).slice(-4).map((r) => r.cid);
    expect(new Set(clubsIn(prelim))).toEqual(new Set(bottom4));
  });

  it("is deterministic, and a season saved mid-way and resumed plays out identically", SLOW, () => {
    const again = start();
    // Stop after the turn of the year, save as plain data, restore and finish.
    while ((nextMatchDate(again) ?? "9999") < "2027-01-01") {
      playDate(again, nextMatchDate(again) as string, play, competitions);
    }
    const resumed = JSON.parse(JSON.stringify(again)) as SeasonState;
    playRest(resumed, play, competitions);
    expect(resumed.fixtures).toEqual(state.fixtures);
    expect(seasonOutcome(resumed, competitions)).toEqual(outcome);
  });
});

describe("the Super League's play-offs (general play-off format)", () => {
  const config = worlds.superLeague.competitions;
  const sl = generateWorld({
    config: worlds.superLeague,
    seed: "season-test",
    name: "t",
    userCid: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  });
  const slState = createSeason({
    config,
    season: 2026,
    seed: "season-test",
    clubs: sl.clubs,
    lastFinish: new Map(),
    firstFid: 1,
  });
  playRest(slState, fullStrengthPlay(sl.clubs, sl.players), config);
  const slOutcome = seasonOutcome(slState, config);
  const atIn = (league: string) => (pos: number) =>
    slOutcome.tables[league]?.[pos - 1]?.cid as number;
  const pairs = (fixtures: readonly Fixture[]) => fixtures.map((f) => [f.homeCid, f.awayCid]);

  it("plays Star's top 8 in its fixed bracket, two-legged, to a neutral final", SLOW, () => {
    const at = atIn("STAR");
    const id = playoffId("STAR");
    const quarters = byRound(slState, id, "Quarter-finals");
    // The better-placed club hosts the second leg.
    expect(pairs(quarters.filter((f) => f.leg === 2))).toEqual([
      [at(1), at(8)],
      [at(4), at(5)],
      [at(2), at(7)],
      [at(3), at(6)],
    ]);
    const won = quarters.filter((f) => f.leg === 2).map((f) => f.result?.winnerCid as number);
    const pos = (cid: number) => (slOutcome.tables.STAR ?? []).findIndex((r) => r.cid === cid);
    const better = (a: number, b: number) => (pos(a) < pos(b) ? [a, b] : [b, a]);
    const semis = byRound(slState, id, "Semi-finals");
    expect(pairs(semis.filter((f) => f.leg === 2))).toEqual([
      better(won[0] as number, won[1] as number),
      better(won[2] as number, won[3] as number),
    ]);
    const [final] = byRound(slState, id, "Final");
    expect(final?.neutral).toBe(true);
    expect(final?.leg).toBeNull();
    expect(slOutcome.playoffWinners.STAR).toEqual([final?.result?.winnerCid]);
    // A title play-off moves nobody.
    expect(slOutcome.moves.filter((m) => m.from === "STAR").map((m) => m.reason)).toEqual([
      "relegated",
      "relegated",
      "relegated",
    ]);
  });

  it("plays Gold's and Blue's 3rd-6th in single-leg semi-finals and a neutral final", SLOW, () => {
    for (const league of ["GOLD", "BLUE"]) {
      const at = atIn(league);
      const semis = byRound(slState, playoffId(league), "Semi-finals");
      expect(pairs(semis)).toEqual([
        [at(3), at(6)],
        [at(4), at(5)],
      ]);
      expect(semis.every((f) => f.leg === null && !f.neutral)).toBe(true);
      const [final] = byRound(slState, playoffId(league), "Final");
      expect(final?.neutral).toBe(true);
      const up = slOutcome.moves.filter((m) => m.from === league && m.reason !== "relegated");
      // The top two go up, and the play-off's winner (T, 2026-10-28: 3 up).
      expect(up.map((m) => [m.cid, m.reason])).toEqual([
        [at(1), "promoted"],
        [at(2), "promoted"],
        [final?.result?.winnerCid, "playoffs"],
      ]);
    }
    expect(slOutcome.moves.filter((m) => m.from === "BLUE" && m.reason === "relegated")).toEqual(
      [],
    );
  });

  it("makes Star's play-off winner the champion and records its table winner", SLOW, () => {
    const [final] = byRound(slState, playoffId("STAR"), "Final");
    expect(slOutcome.champions.STAR).toBe(final?.result?.winnerCid);
    expect(slOutcome.tableWinners).toEqual({ STAR: atIn("STAR")(1) });
    // Gold and Blue: the table winner is the champion, as in Classic's leagues.
    expect(slOutcome.champions.GOLD).toBe(atIn("GOLD")(1));
    expect(outcome.tableWinners).toBeUndefined();

    const awards = seasonAwards(slState, slOutcome, sl.clubs, sl.players, [], config);
    const club = (type: string, competition: string) =>
      awards.filter((a) => a.type === type && a.competition === competition).map((a) => a.cid);
    expect(club("champions", "STAR")).toEqual([final?.result?.winnerCid]);
    expect(club("tableWinner", "STAR")).toEqual([atIn("STAR")(1)]);
    expect(club("playoffWinner", playoffId("STAR"))).toEqual([]);
    expect(club("playoffWinner", playoffId("GOLD"))).toEqual(slOutcome.playoffWinners.GOLD);
    expect(club("tableWinner", "GOLD")).toEqual([]);
  });

  it("lets the board count a play-off: the title semi-finals, a promotion play-off win", () => {
    const [star, gold] = config.leagues as [LeagueConfig, LeagueConfig];
    const fixtures = slState.fixtures;
    const semis = byRound(slState, playoffId("STAR"), "Semi-finals");
    const inSemis = new Set(clubsIn(semis));
    const quarters = byRound(slState, playoffId("STAR"), "Quarter-finals");
    const out = clubsIn(quarters).find((cid) => !inSemis.has(cid)) as number;
    const semifinalist = semis[0]?.homeCid as number;
    expect(metInPlayoff(star, "title", semifinalist, fixtures)).toBe(true);
    expect(metInPlayoff(star, "title", out, fixtures)).toBe(false);
    expect(metInPlayoff(star, "topEight", semifinalist, fixtures)).toBe(false);
    const [final] = byRound(slState, playoffId("GOLD"), "Final");
    const winner = final?.result?.winnerCid as number;
    const loser = (final?.homeCid === winner ? final?.awayCid : final?.homeCid) as number;
    expect(metInPlayoff(gold, "promotion", winner, fixtures)).toBe(true);
    expect(metInPlayoff(gold, "promotion", loser, fixtures)).toBe(false);
  });

  it("shows Star's first place as a play-off place, not the title", () => {
    const [star, gold] = config.leagues;
    expect([1, 8, 9, 13, 14].map((p) => tableZone(star as LeagueConfig, p, 16))).toEqual([
      "playoffs",
      "playoffs",
      null,
      null,
      "relegated",
    ]);
    expect([1, 2, 3, 6, 7].map((p) => tableZone(gold as LeagueConfig, p, 16))).toEqual([
      "champions",
      "promoted",
      "playoffs",
      "playoffs",
      null,
    ]);
    const eng1 = competitions.leagues[0] as LeagueConfig;
    expect(tableZone(eng1, 1, 20)).toBe("champions");
  });

  it("schedules the play-offs after the league, midweek first, finals near their dates", () => {
    const { leagues, playoffs } = slState.calendar;
    for (const id of ["STAR", "GOLD", "BLUE"]) {
      const last = leagues[id]?.at(-1)?.date ?? "";
      const dates = playoffs[id] ?? [];
      expect(dates[0]?.slot).toBe("midweek");
      expect(dates.every((d) => d.date > last)).toBe(true);
    }
    expect(playoffs.STAR?.map((d) => [d.round, d.leg])).toEqual([
      ["Quarter-finals", 1],
      ["Quarter-finals", 2],
      ["Semi-finals", 1],
      ["Semi-finals", 2],
      ["Final", null],
    ]);
    expect(playoffs.STAR?.at(-1)?.date).toBe("2027-05-29");
    expect(playoffs.GOLD?.at(-1)?.date).toBe("2027-05-15");
  });
});
