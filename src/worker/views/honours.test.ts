import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../common/api";
import type { AwardRow, Club } from "../../common/schema";
import { honoursOf } from "./players";

const row = (season: number, cid: number, competition: string, appearances: number) =>
  ({ season, club: { cid }, competition, appearances }) as PlayerView["career"][number];
const clubs = new Map(
  [1, 2, 3].map((cid) => [cid, { cid, name: `Club ${cid}`, abbr: "C", code: "c" } as Club]),
);
let aid = 0;
const award = (
  season: number,
  type: string,
  competition: string,
  cid: number | null,
  pid: number | null = null,
): AwardRow => ({ aid: aid++, season, type, competition, cid, pid, name: "x" });

describe("a player's honours (T, 2026-10-25)", () => {
  // Pid 7: 2026 at club 1 (league ENG1 and the cup), 2027 at club 1 (league, never in the
  // cup), then club 2 in ENG2 for 2028.
  const career = [
    row(2026, 1, "ENG1", 30),
    row(2026, 1, "ENG-CUP", 2),
    row(2027, 1, "ENG1", 12),
    row(2027, 1, "ENG-CUP", 0),
    row(2028, 2, "ENG2", 40),
  ];
  const awards = [
    award(2026, "champions", "ENG1", 1),
    award(2026, "cupWinner", "ENG-CUP", 1),
    award(2027, "cupWinner", "ENG-CUP", 1), // on the bench all cup run: not his
    award(2027, "champions", "ENG1", 3), // another club
    award(2028, "promoted", "ENG2", 2),
    award(2028, "playoffWinner", "ENG2-PO", 2), // counted as the promotion
    award(2028, "relegated", "ENG1", 1), // not an honour
    award(2026, "goldenBoot", "ENG1", 1, 7),
    award(2026, "topAssists", "ENG1", 1, 8), // someone else's
    award(2027, "teamOfTheSeason", "ENG1", 1, 7),
    award(2028, "topAssists", "ENG2", 2, 7),
    award(2028, "playerOfTheYear", "ENG2", 2, 7),
  ];

  it("counts his awards, and his clubs' honours where he played in that competition", () => {
    const got = honoursOf(awards, 7, career, clubs).map((h) => [
      h.season,
      h.type,
      h.competition,
      h.club.cid,
    ]);
    expect(got).toEqual([
      [2026, "champions", "ENG1", 1],
      [2026, "cupWinner", "ENG-CUP", 1],
      [2026, "goldenBoot", "ENG1", 1],
      [2027, "teamOfTheSeason", "ENG1", 1],
      [2028, "promoted", "ENG2", 2],
      [2028, "playerOfTheYear", "ENG2", 2],
      [2028, "topAssists", "ENG2", 2],
    ]);
  });

  it("gives none to a player who never played", () => {
    expect(honoursOf(awards, 9, [row(2026, 1, "ENG1", 0)], clubs)).toEqual([]);
  });
});
