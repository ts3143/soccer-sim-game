import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, Player } from "../../common/schema";
import {
  canSignFreeAgent,
  clubCap,
  luxuryTax,
  payroll,
  relegationGrace,
  shareTax,
  tradeFits,
} from "./softCap";

const config = worlds.superLeague.competitions;
const softCap = config.softCap as NonNullable<typeof config.softCap>;
const STAR = softCap.cap;
const GOLD = Math.round(softCap.cap * (softCap.tierShare.GOLD ?? 0));

const player = (cid: number | null, wage: number, status: Player["status"] = "club") =>
  ({ cid, status, loan: null, contract: { wage, expires: "2029-06-30" } }) as Player;

describe("the soft cap", () => {
  it("counts contracted wages and a released player's wages until his contract ends", () => {
    const club = {
      cid: 3,
      released: [{ pid: 9, name: "Gone", wage: 2_000_000, until: "2028-06-30" }],
    } as Pick<Club, "cid" | "released">;
    const players = [player(3, 5_000_000), player(3, 1_000_000), player(4, 9_000_000)];
    expect(payroll(club, players, "2027-07-01")).toBe(8_000_000);
    // Once his old contract has ended he is off the payroll.
    expect(payroll(club, players, "2028-07-01")).toBe(6_000_000);
    expect(payroll(club, [player(null, 4_000_000, "freeAgent")])).toBe(2_000_000);
  });

  it("sets a club's cap by its tier, and keeps a relegated club's old cap for its grace", () => {
    expect(clubCap(config, { leagueId: "STAR" }, 2027)).toBe(STAR);
    expect(clubCap(config, { leagueId: "GOLD" }, 2027)).toBe(GOLD);
    // Relegated from Star after 2026: Star's cap through 2027, Gold's from 2028.
    const capGrace = relegationGrace(softCap, "STAR", 2026);
    expect(capGrace).toEqual({ leagueId: "STAR", through: 2027 });
    expect(clubCap(config, { leagueId: "GOLD", capGrace }, 2027)).toBe(STAR);
    expect(clubCap(config, { leagueId: "GOLD", capGrace }, 2028)).toBe(GOLD);
    expect(clubCap(worlds.classic.competitions, { leagueId: "ENG1" }, 2027)).toBeNull();
  });

  it("taxes the payroll above the cap at the configured rate, and shares it", () => {
    expect(luxuryTax(softCap, STAR - 1, STAR)).toBe(0);
    expect(luxuryTax(softCap, STAR + 10_000_000, STAR)).toBe(15_000_000);
    expect(shareTax(10, [1, 2, 3])).toEqual(
      new Map([
        [1, 4],
        [2, 3],
        [3, 3],
      ]),
    );
    expect(shareTax(15_000_000, [])).toEqual(new Map());
  });

  it("lets a club over the cap sign free agents at the minimum wage, and trade if matched", () => {
    expect(canSignFreeAgent(softCap, STAR - 5_000_000, STAR, 4_000_000)).toBe(true);
    expect(canSignFreeAgent(softCap, STAR + 1, STAR, 4_000_000)).toBe(false);
    expect(canSignFreeAgent(softCap, STAR + 1, STAR, softCap.minimumWage)).toBe(true);
    // Over the cap: back at most 125% of the wages sent out.
    expect(tradeFits(softCap, STAR + 1, STAR, 4_000_000, 5_000_000)).toBe(true);
    expect(tradeFits(softCap, STAR + 1, STAR, 4_000_000, 5_000_001)).toBe(false);
    // A trade that leaves the club under the cap always fits.
    expect(tradeFits(softCap, STAR - 20_000_000, STAR, 1_000_000, 10_000_000)).toBe(true);
  });
});
