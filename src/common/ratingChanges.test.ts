import { expect, it } from "vitest";
import { ratingChanges } from "./ratingChanges";
import type { RatingsEntry } from "./schema";
const entry = (season: number, date: string, ovr: number, pot: number): RatingsEntry => ({
  season,
  date,
  ovr,
  pot,
  ratings: [],
});
it("uses the final previous-season snapshot, even after a winter update", () => {
  const p = {
    ovr: 65,
    pot: 76,
    ratingsHistory: [
      entry(2026, "2026-07-01", 58, 74),
      entry(2026, "2027-01-01", 60, 78),
      entry(2027, "2027-07-01", 62, 77),
      entry(2027, "2028-01-01", 65, 76),
    ],
  };
  expect(ratingChanges(p, 2027)).toEqual({ ovrChange: 5, potChange: -2 });
});
it("shows no invented change in a new career with no previous season", () => {
  expect(
    ratingChanges({ ovr: 60, pot: 70, ratingsHistory: [entry(2026, "2026-07-01", 60, 70)] }, 2026),
  ).toEqual({ ovrChange: null, potChange: null });
});
