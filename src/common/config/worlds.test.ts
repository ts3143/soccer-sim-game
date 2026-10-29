import { describe, expect, it } from "vitest";
import clubsFile from "../../../data/clubs_2026_27.json";
import raw from "../../../data/config/competitions_mvp.json";
import superLeagueFile from "../../../data/config/competitions_super_league.json";
import { parseClubs } from "./clubs";
import { parseCompetitions } from "./competitions";
import { worldById, worlds } from "./worlds";

describe("worlds", () => {
  it("makes Classic from today's files, with transfers, academies, FFP and loans", () => {
    const classic = worldById("classic");
    expect(classic).toBe(worlds.classic);
    expect(classic.clubs).toEqual(parseClubs(clubsFile));
    expect(classic.clubs).toHaveLength(62);
    expect(classic.competitions).toEqual(parseCompetitions(raw, "competitions_mvp.json"));
    expect(classic.competitions.leagues.map((l) => l.id)).toEqual(["ENG1", "ENG2", "GER1"]);
    expect(classic.switches).toEqual({
      market: "transfers",
      youth: "academy",
      moneyRule: "ffp",
      loans: true,
      renewals: "windows",
    });
  });

  it("makes the Super League: three tiers of 16, trades, the draft, a soft cap", () => {
    const world = worldById("superLeague");
    const { leagues, cups, windows } = world.competitions;
    expect(world.clubs).toHaveLength(48);
    expect(leagues.map((l) => [l.id, l.tier, l.clubs, l.rounds])).toEqual([
      ["STAR", 1, 16, 30],
      ["GOLD", 2, 16, 30],
      ["BLUE", 3, 16, 30],
    ]);
    for (const l of leagues) expect(world.clubs.filter((c) => c.league === l.id)).toHaveLength(16);
    expect(leagues.map((l) => l.relegation)).toEqual([
      { places: 3, to: "GOLD" },
      { places: 3, to: "BLUE" },
      null,
    ]);
    expect(cups).toEqual([]);
    expect(windows).toEqual([]);
    expect(world.switches).toEqual({
      market: "trades",
      youth: "draft",
      moneyRule: "softCap",
      loans: false,
      renewals: "resigningPeriod",
    });
    // The 14 clubs also in Classic: same code and values, T's names in both.
    const classic = new Map(worlds.classic.clubs.map((c) => [c.code, c]));
    const shared = world.clubs.filter((c) => classic.has(c.code));
    expect(shared).toHaveLength(14);
    for (const c of shared)
      expect({ ...c, league: "" }).toEqual({ ...classic.get(c.code), league: "" });
  });

  it("gives the Super League its play-offs: Star's for the title, Gold's and Blue's for promotion", () => {
    const [star, gold, blue] = worldById("superLeague").competitions.leagues;
    expect(star?.promotion).toBeNull();
    expect(star?.playoff).toEqual({
      decides: "title",
      positions: [1, 2, 3, 4, 5, 6, 7, 8],
      rounds: [
        {
          name: "Quarter-finals",
          legs: 2,
          neutral: false,
          entrants: [1, 8, 4, 5, 2, 7, 3, 6],
          pairing: {
            ties: [
              [1, 8],
              [4, 5],
              [2, 7],
              [3, 6],
            ],
          },
        },
        { name: "Semi-finals", legs: 2, neutral: false, entrants: [], pairing: "bracket" },
        { name: "Final", legs: 1, neutral: true, entrants: [], pairing: "bracket" },
      ],
      finalNear: "05-29",
      prizeMoney: { roundWon: [5_000_000, 10_000_000, 20_000_000], runnerUp: 10_000_000 },
    });
    for (const tier of [gold, blue]) {
      // 3 up (T, 2026-10-28): the top 2, then a play-off among 3rd-6th.
      expect(tier?.promotion).toMatchObject({ automatic: 2, promotedPlaces: 1 });
      expect(tier?.playoff).toEqual({
        decides: "promotion",
        positions: [3, 4, 5, 6],
        rounds: [
          {
            name: "Semi-finals",
            legs: 1,
            neutral: false,
            entrants: [3, 4, 5, 6],
            pairing: "reseed",
          },
          { name: "Final", legs: 1, neutral: true, entrants: [], pairing: "reseed" },
        ],
        finalNear: "05-16",
        prizeMoney: { roundWon: [2_000_000, 4_000_000], runnerUp: 2_000_000 },
      });
    }
  });

  it("writes Classic's six-club play-off in the same format", () => {
    expect(worlds.classic.competitions.leagues[1]?.playoff).toEqual({
      decides: "promotion",
      positions: [3, 4, 5, 6, 7, 8],
      rounds: [
        { name: "Eliminators", legs: 1, neutral: false, entrants: [5, 6, 7, 8], pairing: "reseed" },
        { name: "Semi-finals", legs: 2, neutral: false, entrants: [3, 4], pairing: "reseed" },
        { name: "Final", legs: 1, neutral: true, entrants: [], pairing: "reseed" },
      ],
      finalNear: "05-24",
      prizeMoney: null,
    });
  });

  it("makes every play-off round single-leg with allSingleLeg, and checks the rounds", () => {
    type Playoff = { allSingleLeg: boolean; rounds: { ties?: number[][]; legs: number }[] };
    const playoffOf = (file: typeof superLeagueFile) =>
      (file.leagues[0] as unknown as { playoff: Playoff }).playoff;
    const single = structuredClone(superLeagueFile);
    playoffOf(single).allSingleLeg = true;
    const parsed = parseCompetitions(single, "single.json").leagues[0]?.playoff;
    expect(parsed?.rounds.map((r) => r.legs)).toEqual([1, 1, 1]);

    const broken = structuredClone(superLeagueFile);
    (playoffOf(broken).rounds[0] as { ties: number[][] }).ties[0] = [1, 17];
    expect(() => parseCompetitions(broken, "broken.json")).toThrow(
      /^broken\.json: STAR play-off: play-off positions must be table positions/,
    );
    const twoLegFinal = structuredClone(superLeagueFile);
    (playoffOf(twoLegFinal).rounds[2] as { legs: number }).legs = 2;
    expect(() => parseCompetitions(twoLegFinal, "final.json")).toThrow(
      /the final is a single match/,
    );
  });

  it("refuses an unknown world", () => {
    expect(() => worldById("nope")).toThrow(/Unknown world/);
    expect(() => worldById("toString")).toThrow(/Unknown world/);
  });

  it("names the config file when one doesn't add up", () => {
    const broken = structuredClone(raw);
    broken.leagues[0]?.board.pop();
    expect(() => parseCompetitions(broken, "broken.json")).toThrow(
      /^broken\.json: ENG1 board targets cover/,
    );
  });
});
