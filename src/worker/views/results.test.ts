import { expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Fixture } from "../../common/schema";
import { matchView } from "./common";
import { resultForClub, resultRowClass } from "../../ui/components/results";
const fixture = (result: Fixture["result"]): Fixture => ({
  fid: 1,
  season: 2026,
  date: "2026-08-08",
  slot: "weekend",
  competition: "ENG1",
  round: "1",
  homeCid: 1,
  awayCid: 2,
  neutral: false,
  leg: null,
  result,
});
const view = (result: Fixture["result"]) => {
  const m = matchView(fixture(result), new Map(), worlds.classic.competitions);
  return { ...m, home: { ...m.home, cid: 1 }, away: { ...m.away, cid: 2 } };
};
it("colours a result from the viewed club's perspective, including away games", () => {
  const m = view({
    homeGoals: 2,
    awayGoals: 0,
    winnerCid: null,
    penalties: null,
    extraTime: false,
  });
  expect(resultForClub(m, 1)).toBe("W");
  expect(resultForClub(m, 2)).toBe("L");
  expect(resultRowClass(resultForClub(m, 1))).toBe("table-success");
  expect(resultRowClass(resultForClub(m, 2))).toBe("table-danger");
  expect(resultForClub(m, 3)).toBeNull();
});
it("uses yellow for drawn matches and leaves upcoming matches neutral", () => {
  const draw = view({
    homeGoals: 1,
    awayGoals: 1,
    winnerCid: null,
    penalties: null,
    extraTime: false,
  });
  expect(resultForClub(draw, 1)).toBe("D");
  expect(resultForClub(draw, 2)).toBe("D");
  expect(resultRowClass("D")).toBe("table-warning");
  expect(resultForClub(view(null), 1)).toBeNull();
  expect(resultRowClass(null)).toBe("");
});
it("uses a shoot-out winner rather than interpreting the level score as a draw", () => {
  const cup = view({ homeGoals: 1, awayGoals: 1, winnerCid: 2, penalties: "3-4", extraTime: true });
  expect(cup.homeResult).toBe("L");
  expect(resultForClub(cup, 2)).toBe("W");
});
