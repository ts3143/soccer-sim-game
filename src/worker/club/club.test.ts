import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, ClubSeason, Fixture } from "../../common/schema";
import { generateWorld } from "../generate/world";
import type { TableRow } from "../schedule/standings";
import {
  boardSacks,
  boardTargets,
  jobOffers,
  preseasonBoard,
  startingConfidence,
  updateConfidence,
} from "./board";
import {
  aiDials,
  effectiveDials,
  expectedPoints,
  seasonEndStanding,
  setEffectiveDials,
  updateHype,
} from "./standing";

const competitions = worlds.classic.competitions;

const world = generateWorld({
  config: worlds.classic,
  seed: "club-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const rows = () => new Map(structuredClone(world.clubSeasons).map((r) => [r.cid, r]));
const club = (cid: number) => structuredClone(world.clubs[cid] as Club);
const played = (home: number, away: number, hg: number, ag: number): Fixture => ({
  fid: 1,
  season: 2026,
  date: "2026-08-15",
  slot: "weekend",
  competition: "ENG1",
  round: "1",
  homeCid: home,
  awayCid: away,
  neutral: false,
  leg: null,
  result: { homeGoals: hg, awayGoals: ag, extraTime: false, penalties: null, winnerCid: null },
});

describe("hype and reputation", () => {
  it("expects about 1.35 points between equals and most of 3 for a big favourite", () => {
    expect(expectedPoints(0)).toBeGreaterThan(1.25);
    expect(expectedPoints(0)).toBeLessThan(1.45);
    expect(expectedPoints(8)).toBeGreaterThan(2.5);
    expect(expectedPoints(-8)).toBeLessThan(0.5);
  });

  it("lifts hype more for an underdog's win than a favourite's", () => {
    const r = rows();
    const strengths: Record<number, number> = { 0: 70, 1: 60 };
    const underdog = r.get(1) as ClubSeason;
    const favourite = r.get(0) as ClubSeason;
    const before = [underdog.hype, favourite.hype];
    updateHype(r, played(1, 0, 2, 0), (cid) => strengths[cid] ?? 60);
    const underdogGain = underdog.hype - (before[0] ?? 0);
    updateHype(r, played(0, 1, 2, 0), (cid) => strengths[cid] ?? 60);
    const favouriteGain = favourite.hype - (before[1] ?? 0);
    expect(underdogGain).toBeGreaterThan(favouriteGain);
  });

  it("moves reputation toward the finish's level and facilities toward the dial", () => {
    const r = rows();
    const clubs = world.clubs.map((c) => ({ ...c, budget: { ...c.budget, facilities: 90 } }));
    const eng1 = clubs.filter((c) => c.leagueId === "ENG1");
    const weakest = [...eng1].sort(
      (a, b) => (r.get(a.cid)?.reputation ?? 0) - (r.get(b.cid)?.reputation ?? 0),
    )[0] as Club;
    const before = r.get(weakest.cid)?.reputation ?? 0;
    const finish = new Map(eng1.map((c, i) => [c.cid, c.cid === weakest.cid ? 1 : i + 2]));
    seasonEndStanding(clubs, r, finish, new Set([weakest.cid]), worlds.classic);
    expect(r.get(weakest.cid)?.reputation ?? 0).toBeGreaterThan(before + 2);
    expect(clubs[0]?.facilitiesLevel).toBeGreaterThan(50);
  });

  it("makes the dials' effects relative to the average club (ZenGM-style)", () => {
    const clubs = world.clubs.slice(0, 4).map((c) => structuredClone(c));
    for (const c of clubs) c.budget = { coaching: 70, youth: 70, medical: 70, facilities: 70 };
    (clubs[0] as Club).budget = { coaching: 90, youth: 50, medical: 70, facilities: 70 };
    setEffectiveDials(clubs);
    expect(clubs[1]?.budgetEffect?.medical).toBe(50); // everyone at 70: no edge
    expect(clubs[0]?.budgetEffect?.coaching).toBe(65); // 90 against an average of 75
    expect(clubs[0]?.budgetEffect?.youth).toBe(35);
    expect(effectiveDials(clubs[0] as Club).coaching).toBe(65);
  });

  it("sets AI dials higher with cash in hand, within bounds", () => {
    expect(aiDials(1e9, 1e8).coaching).toBe(70);
    expect(aiDials(-1e9, 1e8).coaching).toBe(35);
    expect(aiDials(3e7, 1e8).coaching).toBe(50);
  });
});

describe("the board", () => {
  it("gives targets by squad strength rank, as the league's config says", () => {
    const strengths = world.clubs
      .filter((c) => c.leagueId === "ENG1")
      .map((c, i) => ({ cid: c.cid, strength: 80 - i }));
    const targets = boardTargets("ENG1", strengths, competitions);
    const count = (id: string) => targets.filter((t) => t.target === id).length;
    expect([count("title"), count("top4"), count("midTable"), count("avoidRelegation")]).toEqual([
      2, 4, 8, 6,
    ]);
    expect(targets[0]?.cid).toBe(strengths[0]?.cid);
    const ger = competitions.leagues.find((l) => l.id === "GER1");
    expect(ger?.board.at(-1)?.id).toBe("aboveBottom3");
  });

  it("moves confidence from its start toward results, money and hype as the season goes", () => {
    const r = rows();
    const row = r.get(0) as ClubSeason;
    row.boardExpectation = "midTable";
    row.boardStart = 60;
    const table = (position: number): TableRow[] => [
      {
        cid: 0,
        position,
        played: 19,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ];
    expect(updateConfidence(row, club(0), table(1), 0, competitions)).toBe(60);
    const top = updateConfidence(row, club(0), table(1), 0.5, competitions);
    const bottom = updateConfidence(row, club(0), table(20), 0.5, competitions);
    expect(top).toBeGreaterThan(60);
    expect(bottom).toBeLessThan(top);
    const broke = { ...club(0), cash: -2 * club(0).revenueAnchor };
    expect(updateConfidence(row, broke, table(20), 0.5, competitions)).toBeLessThan(bottom);
    expect(startingConfidence(20)).toBe(40);
    expect(startingConfidence(null)).toBe(60);
  });

  it("sacks below 25 from a third of the season, or below 35 at its end", () => {
    expect(boardSacks(20, 0.2, false)).toBe(false);
    expect(boardSacks(20, 0.4, false)).toBe(true);
    expect(boardSacks(30, 0.9, false)).toBe(false);
    expect(boardSacks(30, 1, true)).toBe(true);
  });

  it("offers 1–3 jobs at clubs with lower reputation, the same for the same seed", () => {
    const r = rows();
    const top = [...r.values()].sort((a, b) => b.reputation - a.reputation)[0] as ClubSeason;
    const offers = jobOffers(world.clubs, r, top.cid, "seed", "2027-01-01");
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.length).toBeLessThanOrEqual(3);
    for (const cid of offers) expect(r.get(cid)?.reputation ?? 99).toBeLessThan(top.reputation);
    expect(jobOffers(world.clubs, r, top.cid, "seed", "2027-01-01")).toEqual(offers);
  });

  it("sets every club's target before the season and tells the user his", () => {
    const r = rows();
    const message = preseasonBoard(
      { clubs: world.clubs, players: world.players, clubSeasons: r, userCid: 0 },
      2026,
      "2026-07-01",
      competitions,
    );
    expect([...r.values()].every((row) => row.boardExpectation !== null)).toBe(true);
    expect(message?.subject).toMatch(/The board's target/);
  });
});
