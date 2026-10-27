import { describe, expect, it } from "vitest";
import clubsFile from "../../../data/clubs_2026_27.json";
import raw from "../../../data/config/competitions_mvp.json";
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

  it("refuses an unknown world", () => {
    expect(() => worldById("superLeague")).toThrow(/Unknown world/);
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
