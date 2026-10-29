import { describe, expect, it } from "vitest";
import { applyClubNames, clubNamesTemplate, readClubNames } from "./clubNames";
import { worlds } from "./config/worlds";

const clubs = worlds.superLeague.clubs;
const file = (entries: unknown) => JSON.stringify({ clubs: entries });

describe("a names file", () => {
  it("reads a template unchanged in both worlds: their names and abbreviations are unique", () => {
    for (const world of Object.values(worlds)) {
      const read = readClubNames(clubNamesTemplate(world.clubs), world.clubs);
      expect(read.problems).toEqual([]);
      expect(applyClubNames(world.clubs, read.names)).toEqual(world.clubs);
    }
  });

  it("renames only the clubs and fields it gives", () => {
    const read = readClubNames(file({ lyo: { name: "Lyon Lions", abbr: "LYL" } }), clubs);
    expect(read.problems).toEqual([]);
    const renamed = applyClubNames(clubs, read.names);
    const lyon = renamed.find((c) => c.code === "lyo");
    expect(lyon).toMatchObject({ name: "Lyon Lions", short: "Gones", abbr: "LYL" });
    expect(renamed.filter((c, i) => c !== clubs[i])).toHaveLength(1);
  });

  it("says what's wrong", () => {
    const problems = (text: string) => readClubNames(text, clubs).problems;
    expect(problems("{")).toEqual(["The file isn't valid JSON."]);
    expect(problems("{}")).toEqual(['The file needs a "clubs" object, by club id.']);
    expect(problems(file({ xyz: { name: "X" } }))).toEqual([
      `There's no club "xyz" in this world.`,
    ]);
    expect(problems(file({ lyo: "Lyon" }))).toEqual([
      `"lyo" needs an object with "name", "short" or "abbr".`,
    ]);
    expect(problems(file({ lyo: { nam: "Lyon" } }))).toEqual([
      `"lyo": unknown field "nam" (use "name", "short" or "abbr").`,
    ]);
    expect(problems(file({ lyo: { name: " Lyon" } }))[0]).toMatch(/must be text/);
    expect(problems(file({ lyo: { name: 7 } }))[0]).toMatch(/must be text/);
    expect(problems(file({ lyo: { abbr: "ly" } }))[0]).toMatch(/2 to 4 capital/);
    expect(problems(file({ lyo: { name: "L".repeat(41) } }))[0]).toMatch(/longer than 40/);
    // Two clubs can't end up with one name or abbreviation.
    const other = clubs.find((c) => c.code !== "lyo");
    expect(problems(file({ lyo: { abbr: other?.abbr } }))).toEqual([
      expect.stringMatching(/would both be abbr/),
    ]);
    // A file that renames nothing well renames nothing.
    expect(readClubNames(file({ lyo: { abbr: "x" } }), clubs).names).toEqual({});
  });
});
