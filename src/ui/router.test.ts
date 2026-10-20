import { describe, expect, it } from "vitest";
import { leaguePath, parseRoute } from "./router";

describe("routes", () => {
  it("reads the home, new league and developer pages", () => {
    expect(parseRoute("/")).toEqual({ kind: "home" });
    expect(parseRoute("/new")).toEqual({ kind: "new" });
    expect(parseRoute("/dev")).toEqual({ kind: "notFound" });
  });

  it("reads league pages with their parameters", () => {
    expect(parseRoute("/l/3")).toEqual({ kind: "league", lid: 3, page: "dashboard", params: [] });
    expect(parseRoute("/l/3/squad/12/")).toEqual({
      kind: "league",
      lid: 3,
      page: "squad",
      params: ["12"],
    });
    expect(parseRoute("/l/x/squad")).toEqual({ kind: "notFound" });
    expect(parseRoute("/nowhere")).toEqual({ kind: "notFound" });
  });

  it("builds the paths it reads", () => {
    expect(leaguePath(1)).toBe("/l/1");
    expect(leaguePath(1, "squad", 5)).toBe("/l/1/squad/5");
    expect(leaguePath(2, "standings", "ENG1", 2027)).toBe("/l/2/standings/ENG1/2027");
    const route = parseRoute(leaguePath(2, "player", 123));
    expect(route).toEqual({ kind: "league", lid: 2, page: "player", params: ["123"] });
  });
});
