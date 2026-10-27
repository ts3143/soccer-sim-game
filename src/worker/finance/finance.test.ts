import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { leagueById } from "../../common/config/competitions";
import type { Club, ClubSeason, Fixture } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { createSeason } from "../season/season";
import { runDays } from "../season/runner";
import { startingReputation, type LoopWorld } from "../season/offseason";
import {
  attendance,
  closeSeasonBooks,
  meritIncome,
  monthEnds,
  openSeasonBooks,
  prizeIncome,
  ticketPrice,
  operatingRevenue,
  totalOf,
} from "./finance";

const competitions = worlds.classic.competitions;

const SLOW = { timeout: 120_000 };
const world = generateWorld({
  config: worlds.classic,
  seed: "finance-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const ENG1 = leagueById(competitions, "ENG1");

describe("revenue formulas", () => {
  it("prices tickets by reputation and league", () => {
    expect(ticketPrice(90, ENG1)).toBeGreaterThan(ticketPrice(60, ENG1));
    expect(ticketPrice(50, ENG1)).toBe(ENG1.finance.ticketPriceBase);
    expect(ticketPrice(50, leagueById(competitions, "ENG2"))).toBeLessThan(ticketPrice(50, ENG1));
  });

  it("fills more seats with hype, never more than capacity", () => {
    const club = { capacity: 40_000, market: 60 };
    expect(attendance(club, 80, ENG1, 50)).toBeGreaterThan(attendance(club, 30, ENG1, 50));
    expect(attendance(club, 100, ENG1, 100)).toBeLessThanOrEqual(40_000);
    expect(attendance(club, 50, ENG1, 50, 0.75)).toBeLessThan(attendance(club, 50, ENG1, 50));
  });

  it("lists month-ends between two dates", () => {
    expect(monthEnds("2026-07-01", "2026-09-30")).toEqual([
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
    ]);
    expect(monthEnds("2026-07-31", "2026-08-30")).toEqual([]);
    expect(monthEnds("2027-01-30", "2027-03-01")).toEqual(["2027-01-31", "2027-02-28"]);
  });
});

describe("TV merit and prize money", () => {
  const books = () => {
    const clubs = structuredClone(world.clubs);
    const rows = new Map(structuredClone(world.clubSeasons).map((r) => [r.cid, r]));
    return { clubs, players: [], clubSeasons: rows };
  };

  it("splits the merit pool by final position, last place one share", () => {
    const b = books();
    const order = b.clubs.filter((c) => c.leagueId === "ENG1").map((c) => c.cid);
    meritIncome(b, "ENG1", order, competitions);
    const paid = order.map((cid) => b.clubSeasons.get(cid)?.revenue.merit ?? 0);
    const pool = ENG1.finance.broadcastPool * (1 - ENG1.finance.equalShare);
    expect(paid.reduce((a, x) => a + x, 0)).toBeCloseTo(pool, -2);
    expect(paid[0]).toBeCloseTo((paid[19] ?? 0) * 20, -2);
  });

  it("pays the cup winner each round and the beaten finalist", () => {
    const b = books();
    const cup = competitions.cups[0];
    if (!cup) throw new Error("no cup");
    const tie = (round: string, leg: Fixture["leg"], winnerCid: number): Fixture => ({
      fid: 1,
      season: 2026,
      date: "2027-05-15",
      slot: "weekend",
      competition: cup.id,
      round,
      homeCid: 0,
      awayCid: 1,
      neutral: true,
      leg,
      result: { homeGoals: 1, awayGoals: 0, extraTime: false, penalties: null, winnerCid },
    });
    prizeIncome(b, tie(cup.rounds[0] as string, 1, 0), competitions); // a first leg pays nothing
    expect(b.clubSeasons.get(0)?.revenue.prize).toBeUndefined();
    prizeIncome(b, tie(cup.rounds.at(-1) as string, null, 0), competitions);
    expect(b.clubSeasons.get(0)?.revenue.prize).toBe(cup.prizeMoney.roundWon.at(-1));
    expect(b.clubSeasons.get(1)?.revenue.prize).toBe(cup.prizeMoney.runnerUp);
  });
});

describe("opening contracts", () => {
  it("start each club at 50–65% squad cost, ~70% of it wages, the rest past fees", () => {
    for (const club of world.clubs) {
      const seniors = world.players.filter((p) => p.cid === club.cid && p.status === "club");
      const wages = seniors.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
      const fees = seniors.reduce((s, p) => s + (p.feeBalance?.perYear ?? 0), 0);
      const ratio = (wages + fees) / club.revenueAnchor;
      expect(ratio).toBeGreaterThan(0.49);
      expect(ratio).toBeLessThan(0.66);
      expect(wages / (wages + fees)).toBeCloseTo(0.7, 1);
    }
    const young = world.players.filter(
      (p) => p.status === "club" && Number(p.birthDate.slice(0, 4)) >= 2006,
    );
    expect(young.every((p) => !p.feeBalance)).toBe(true);
    const bought = world.players.find((p) => p.feeBalance);
    const years = Number(bought?.contract?.expires.slice(0, 4)) - 2026;
    expect(bought?.feeBalance?.remaining).toBe((bought?.feeBalance?.perYear ?? 0) * years);
  });
});

describe("a season's money", () => {
  const clubs: Club[] = structuredClone(world.clubs);
  const startCash = new Map(clubs.map((c) => [c.cid, c.cash]));
  const rows = new Map<number, ClubSeason>(
    structuredClone(world.clubSeasons).map((r) => [r.cid, r]),
  );
  let pid = 99_999;
  const loop: LoopWorld = {
    config: worlds.classic,
    clubs,
    players: structuredClone(world.players),
    reputation: startingReputation(worlds.classic.clubs),
    clubSeasons: rows,
    userCid: 0,
    seed: "finance-test",
    nextPid: () => pid++,
  };
  const state = createSeason({
    config: competitions,
    season: 2026,
    seed: "finance-test",
    clubs,
    lastFinish: new Map(),
    firstFid: 1,
  });
  runDays(loop, state, "2026-07-01", { limit: null });
  const lastDay = state.fixtures.reduce((d, f) => (f.date > d ? f.date : d), "2026-07-01");
  closeSeasonBooks(loop, 2026, lastDay, 0, competitions);

  it("lands each league's season-1 revenue near the clubs' anchors", SLOW, () => {
    for (const league of competitions.leagues) {
      const own = clubs.filter((c) => c.leagueId === league.id);
      const errors = own.map(
        (c) => operatingRevenue(rows.get(c.cid)?.revenue ?? {}) / c.revenueAnchor - 1,
      );
      const meanAbs = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
      expect(Math.abs(errors.reduce((s, e) => s + e, 0) / errors.length)).toBeLessThan(0.08);
      expect(meanAbs).toBeLessThan(0.15);
    }
  });

  it("pays the TV equal share in ten instalments and every club's books balance", SLOW, () => {
    for (const club of clubs) {
      const row = rows.get(club.cid) as ClubSeason;
      const league = leagueById(competitions, row.leagueId);
      const equal = (league.finance.broadcastPool * league.finance.equalShare) / league.clubs;
      expect(row.revenue.broadcast).toBeCloseTo(equal, -2);
      expect(row.revenue.matchday ?? 0).toBeGreaterThan(0);
      expect(row.expenses.wages ?? 0).toBeGreaterThan(0);
      expect(row.cashEnd).toBe(club.cash);
      const expected =
        (startCash.get(club.cid) ?? 0) + totalOf(row.revenue) - totalOf(row.expenses);
      expect(club.cash).toBe(expected);
    }
  });

  it("opens next season's books on last season's revenue", SLOW, () => {
    const next = openSeasonBooks(clubs, rows, 2027, 0, competitions);
    const club = clubs[0] as Club;
    expect(next.get(club.cid)?.budgetBase).toBe(
      operatingRevenue(rows.get(club.cid)?.revenue ?? {}),
    );
    expect(next.get(club.cid)?.revenue).toEqual({});
  });
});
