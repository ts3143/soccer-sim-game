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
      { places: 2, to: "GOLD" },
      { places: 2, to: "BLUE" },
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

  it("gives the Super League its play-off formats", () => {
    const [star, gold, blue] = worldById("superLeague").competitions.leagues;
    expect(star?.promotion).toBeNull();
    expect(star?.titlePlayoff).toEqual({
      positions: [1, 2, 3, 4, 5, 6, 7, 8],
      firstRound: [
        [1, 8],
        [4, 5],
        [2, 7],
        [3, 6],
      ],
      rounds: [
        { id: "quarterFinals", legs: 2, neutral: false },
        { id: "semiFinals", legs: 2, neutral: false },
        { id: "final", legs: 1, neutral: true },
      ],
      finalNear: "05-29",
    });
    for (const tier of [gold, blue]) {
      expect(tier?.promotion).toMatchObject({ automatic: 1, promotedPlaces: 1 });
      expect(tier?.promotion?.playoffFormat).toEqual({
        positions: [2, 3, 4, 5],
        firstRound: [
          [2, 5],
          [3, 4],
        ],
        rounds: [
          { id: "semiFinals", legs: 1, neutral: false },
          { id: "final", legs: 1, neutral: true },
        ],
        finalNear: "05-16",
      });
    }
    // Classic's play-offs keep the format the season code knows.
    expect(worlds.classic.competitions.leagues[1]?.promotion?.playoffFormat).toBeNull();
  });

  it("makes every play-off round single-leg with allSingleLeg, and checks the bracket", () => {
    type Star = { titlePlayoff: { allSingleLeg: boolean; firstRound: number[][] } };
    const single = structuredClone(superLeagueFile);
    (single.leagues[0] as unknown as Star).titlePlayoff.allSingleLeg = true;
    const parsed = parseCompetitions(single, "single.json").leagues[0]?.titlePlayoff;
    expect(parsed?.rounds.map((r) => r.legs)).toEqual([1, 1, 1]);

    const broken = structuredClone(superLeagueFile);
    (broken.leagues[0] as unknown as Star).titlePlayoff.firstRound[0] = [1, 9];
    expect(() => parseCompetitions(broken, "broken.json")).toThrow(
      /^broken\.json: STAR title play-off: the first round must pair every play-off position once/,
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
