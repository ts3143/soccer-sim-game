import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { parseTieBreakers } from "../../common/config/competitions";
import type { Fixture } from "../../common/schema";
import { Random } from "../core/random";
import {
  inWinterBreak,
  nearestSlot,
  NO_MATCH_DAYS,
  seasonCalendar,
  seasonDate,
  SLOT_WEEKDAY,
  slotDates,
} from "./calendar";
import { doubleRoundRobin, leagueFixtures } from "./fixtures";
import { leagueTable } from "./standings";

const competitions = worlds.classic.competitions;

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const SEASONS = Array.from({ length: 20 }, (_, i) => 2026 + i);
const DEFAULT_TIE_BREAKERS = competitions.leagues[0]?.tieBreakers ?? [];

describe("slot helpers", () => {
  it("maps MM-DD templates into the season (July–June)", () => {
    expect(seasonDate(2026, "08-15")).toBe("2026-08-15");
    expect(seasonDate(2026, "05-23")).toBe("2027-05-23");
  });

  it("moves a date to the nearest Saturday or Wednesday", () => {
    expect(nearestSlot("2027-05-23", "weekend")).toBe("2027-05-22"); // Sunday → Saturday before
    expect(nearestSlot("2026-08-28", "weekend")).toBe("2026-08-29"); // Friday → Saturday after
    expect(nearestSlot("2026-08-27", "weekend")).toBe("2026-08-29"); // Thursday → Saturday after
    expect(nearestSlot("2026-08-25", "weekend")).toBe("2026-08-22"); // Tuesday → Saturday before
    expect(nearestSlot("2026-08-15", "weekend")).toBe("2026-08-15");
    expect(weekday(nearestSlot("2026-08-15", "midweek"))).toBe(3);
  });

  it("lists slot dates inclusively", () => {
    expect(slotDates("2026-08-15", "2026-08-29", "weekend")).toEqual([
      "2026-08-15",
      "2026-08-22",
      "2026-08-29",
    ]);
  });
});

describe("season calendar (20 seasons)", () => {
  for (const season of SEASONS) {
    it(`${season}/${String((season + 1) % 100).padStart(2, "0")} follows every calendar rule`, () => {
      const cal = seasonCalendar(season, competitions);
      for (const league of competitions.leagues) {
        const rounds = cal.leagues[league.id] ?? [];
        expect(rounds).toHaveLength(league.rounds);
        const first = nearestSlot(seasonDate(season, league.firstMatch), "weekend");
        const last = nearestSlot(seasonDate(season, league.lastMatch), "weekend");
        rounds.forEach((r, i) => {
          expect(r.round).toBe(String(i + 1));
          expect(weekday(r.date)).toBe(SLOT_WEEKDAY[r.slot]);
          expect(r.date >= first && r.date <= last).toBe(true);
          expect(inWinterBreak(r.date, league.country, season, competitions)).toBe(false);
          expect(NO_MATCH_DAYS).not.toContain(r.date.slice(5));
          if (i > 0) expect(r.date > (rounds[i - 1]?.date ?? "")).toBe(true);
        });
        expect(rounds[0]?.date).toBe(first);
        // Weekends are used before midweeks: a league with midweek rounds has no spare weekend.
        if (rounds.some((r) => r.slot === "midweek"))
          expect(cal.spareWeekends[league.id]).toEqual([]);
      }
      for (const league of competitions.leagues.filter((l) => l.promotion)) {
        // Play-offs: after the last league round, in order, never on one of its cup dates,
        // the final on the weekend nearest 24 May.
        const po = cal.playoffs[league.id] ?? [];
        expect(po.map((r) => `${r.round}${r.leg ?? ""}`)).toEqual([
          "Eliminators",
          "Semi-finals1",
          "Semi-finals2",
          "Final",
        ]);
        expect(po.map((r) => r.slot)).toEqual(["midweek", "weekend", "midweek", "weekend"]);
        let previous = cal.leagues[league.id]?.at(-1)?.date ?? "";
        const cupDates = new Set(
          competitions.cups
            .filter((c) => c.entrants.includes(league.id))
            .flatMap((c) => (cal.cups[c.id] ?? []).map((r) => r.date)),
        );
        for (const r of po) {
          expect(r.date > previous).toBe(true);
          expect(weekday(r.date)).toBe(SLOT_WEEKDAY[r.slot]);
          expect(cupDates.has(r.date)).toBe(false);
          previous = r.date;
        }
        const finalDay = po.at(-1)?.date.slice(5) ?? "";
        expect(finalDay >= "05-21" && finalDay <= "05-27").toBe(true);
      }
      for (const cup of competitions.cups) {
        const rounds = cal.cups[cup.id] ?? [];
        expect(rounds.map((r) => r.round)).toEqual(cup.rounds);
        const final = rounds[rounds.length - 1];
        expect(final?.slot).toBe("weekend");
        rounds.forEach((r, i) => {
          expect(weekday(r.date)).toBe(SLOT_WEEKDAY[r.slot]);
          expect(inWinterBreak(r.date, cup.country, season, competitions)).toBe(false);
          expect(NO_MATCH_DAYS).not.toContain(r.date.slice(5));
          if (i > 0) expect(r.date > (rounds[i - 1]?.date ?? "")).toBe(true);
        });
        // No entrant league plays a round on a cup date (final weekend or cup midweek).
        const cupDates = new Set(rounds.map((r) => r.date));
        for (const id of cup.entrants) {
          for (const r of cal.leagues[id] ?? []) expect(cupDates.has(r.date)).toBe(false);
        }
      }
    });
  }

  it("2026/27: ENG2 plays 7 midweek rounds; GER1 finishes the week before the cup final", () => {
    const cal = seasonCalendar(2026, competitions);
    const eng2 = cal.leagues.ENG2 ?? [];
    expect(eng2.filter((r) => r.slot === "midweek")).toHaveLength(7);
    expect(cal.leagues.ENG1?.every((r) => r.slot === "weekend")).toBe(true);
    expect(cal.leagues.GER1?.at(-1)?.date).toBe("2027-05-15");
    expect(cal.cups.GERCUP?.at(-1)?.date).toBe("2027-05-22");
    expect(cal.cups.ENGCUP?.at(-1)?.date).toBe("2027-05-15");
    expect(cal.leagues.ENG1?.at(-1)?.date).toBe("2027-05-22");
  });
});

describe("league fixtures", () => {
  for (const n of [18, 20, 24]) {
    it(`${n} clubs: every pair meets once at each ground, once per round, at most 2 in a row at home or away`, () => {
      const rounds = doubleRoundRobin(n);
      expect(rounds).toHaveLength(2 * (n - 1));
      const meetings = new Map<string, number[]>();
      const venues: string[] = Array.from({ length: n }, () => "");
      rounds.forEach((pairs, r) => {
        const seen = new Set<number>();
        for (const [home, away] of pairs) {
          expect(seen.has(home) || seen.has(away)).toBe(false);
          seen.add(home).add(away);
          venues[home] += "H";
          venues[away] += "A";
          const key = `${home}-${away}`;
          expect(meetings.has(key)).toBe(false);
          meetings.set(key, [r]);
          const reverse = meetings.get(`${away}-${home}`);
          if (reverse) expect(r - (reverse[0] ?? 0)).toBeGreaterThanOrEqual(n - 2);
        }
        expect(seen.size).toBe(n);
      });
      expect(meetings.size).toBe(n * (n - 1));
      for (const v of venues) expect(v).not.toMatch(/HHH|AAA/);
    });
  }

  it("dates fixtures from the calendar and shuffles clubs per season", () => {
    const cal = seasonCalendar(2026, competitions);
    const cids = Array.from({ length: 20 }, (_, i) => 100 + i);
    let fid = 1;
    const make = (seed: string) =>
      leagueFixtures(
        "ENG1",
        2026,
        cids,
        cal.leagues.ENG1 ?? [],
        Random.fromSeed(seed),
        () => fid++,
      );
    const a = make("save/fixtures/ENG1/2026");
    expect(a).toHaveLength(380);
    expect(new Set(a.map((f) => f.fid)).size).toBe(380);
    expect(new Set(a.map((f) => f.date))).toEqual(new Set(cal.leagues.ENG1?.map((r) => r.date)));
    const pairs = (fixtures: Fixture[]) => fixtures.map((f) => `${f.homeCid}-${f.awayCid}`);
    expect(pairs(make("save/fixtures/ENG1/2026"))).toEqual(pairs(a));
    expect(pairs(make("save/fixtures/ENG1/2027"))).not.toEqual(pairs(a));
  });
});

describe("league table and tie-breakers", () => {
  let fid = 0;
  const played = (home: number, away: number, hg: number, ag: number): Fixture => ({
    fid: fid++,
    season: 2026,
    date: "2026-08-15",
    slot: "weekend",
    competition: "T",
    round: "1",
    homeCid: home,
    awayCid: away,
    neutral: false,
    leg: null,
    result: { homeGoals: hg, awayGoals: ag, extraTime: false, penalties: null, winnerCid: null },
  });
  const table = (
    cids: number[],
    fixtures: Fixture[],
    tieBreakers = DEFAULT_TIE_BREAKERS,
    drawSeed = "t",
  ) => leagueTable(cids, fixtures, { tieBreakers, drawSeed }).map((r) => r.cid);

  it("gives 3 points for a win and 1 for a draw, and counts goals", () => {
    const rows = leagueTable([1, 2, 3], [played(1, 2, 2, 0), played(2, 3, 1, 1)], {
      tieBreakers: DEFAULT_TIE_BREAKERS,
      drawSeed: "t",
    });
    expect(rows.map((r) => [r.cid, r.points, r.played, r.goalDifference])).toEqual([
      [1, 3, 1, 2],
      [3, 1, 1, 0],
      [2, 1, 2, -2],
    ]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows[2]).toMatchObject({ won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 3 });
  });

  it("breaks a points tie on goal difference, then goals scored", () => {
    // 1 and 2 both 3 pts; 1 has GD +3, 2 has GD +1 (and 4, beaten 1–0, is above 3).
    expect(table([1, 2, 3, 4], [played(1, 3, 3, 0), played(2, 4, 1, 0)])).toEqual([1, 2, 4, 3]);
    // 1 and 2 both 3 pts and GD +1; 2 scored more.
    expect(table([1, 2, 3, 4], [played(1, 3, 1, 0), played(2, 4, 3, 2)]).slice(0, 2)).toEqual([
      2, 1,
    ]);
  });

  it("then uses head-to-head among the tied clubs only", () => {
    // 1 and 2: 4 pts, GD +1, 3 goals each. 2 beat 1.
    const fixtures = [
      played(2, 1, 1, 0),
      played(1, 3, 3, 1),
      played(1, 4, 0, 0),
      played(2, 3, 2, 2),
    ];
    expect(table([1, 2, 3, 4], fixtures).slice(0, 2)).toEqual([2, 1]);
    // A league that put head-to-head before goal difference orders differently.
    const h2hFirst = parseTieBreakers("X", ["points", "headToHeadPoints", "goalDifference"]);
    const lopsided = [
      played(2, 1, 1, 0),
      played(1, 3, 5, 0),
      played(2, 3, 0, 0),
      played(3, 1, 0, 0),
    ];
    expect(table([1, 2, 3], lopsided).slice(0, 2)).toEqual([1, 2]); // GD: 1 is +4, 2 is +1
    expect(table([1, 2, 3], lopsided, h2hFirst).slice(0, 2)).toEqual([2, 1]);
  });

  it("settles a three-way tie with a mini-table of those three", () => {
    // 1, 2, 3 all on 3 pts with GD 0 and 1 goal: a cycle of 1–0 wins.
    const fixtures = [played(1, 2, 1, 0), played(2, 3, 1, 0), played(3, 1, 1, 0)];
    const rows = table([1, 2, 3], fixtures, parseTieBreakers("X", ["points", "headToHeadPoints"]));
    // Still level after head-to-head: no draw in this list, so club ID order.
    expect(rows).toEqual([1, 2, 3]);
  });

  it("ends with a seeded draw that is stable for the same seed", () => {
    const fixtures = [played(1, 2, 1, 1), played(3, 4, 1, 1)];
    const a = table([1, 2, 3, 4], fixtures, DEFAULT_TIE_BREAKERS, "save/table/ENG1/2026");
    expect(table([1, 2, 3, 4], fixtures, DEFAULT_TIE_BREAKERS, "save/table/ENG1/2026")).toEqual(a);
    const orders = new Set(
      ["a", "b", "c", "d", "e", "f"].map((s) =>
        table([1, 2, 3, 4], fixtures, DEFAULT_TIE_BREAKERS, s).join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("validates each league's tie-breaker list", () => {
    expect(competitions.leagues.every((l) => l.tieBreakers[0] === "points")).toBe(true);
    expect(() => parseTieBreakers("X", ["points", "awayGoals"])).toThrow(/unknown/);
    expect(() => parseTieBreakers("X", ["points", "draw", "goalsFor"])).toThrow(/last/);
    expect(() => parseTieBreakers("X", ["points", "goalsFor", "goalsFor"])).toThrow(/twice/);
    expect(() => parseTieBreakers("X", ["goalDifference", "points"])).toThrow(/start/);
  });
});
