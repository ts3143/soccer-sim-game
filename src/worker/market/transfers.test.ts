import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, ClubSeason, Player } from "../../common/schema";
import { operatingRevenue } from "../finance/finance";
import { generateWorld } from "../generate/world";
import { playerMood } from "./market";
import { clubLevels } from "./renewals";
import {
  askingPrice,
  bidOutcome,
  clubBudgets,
  completeTransfer,
  moodToward,
  seniorsOf,
  type TransferWorld,
} from "./transfers";

const generated = generateWorld({
  config: worlds.classic,
  seed: "transfer-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const JULY = "2026-07-01";
const JANUARY = "2027-01-02";
const freshWorld = (): TransferWorld => ({
  config: worlds.classic,
  clubs: structuredClone(generated.clubs),
  players: structuredClone(generated.players),
  clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
  userCid: 0,
});
const setTarget = (w: TransferWorld, cid: number, target: string) => {
  (w.clubSeasons.get(cid) as ClubSeason).boardExpectation = target;
};
const ratio = (w: TransferWorld, p: Player, date: string) => {
  const v = askingPrice(w, p, date);
  return v.asking / v.value;
};
/** A player of prime age (25–28) at `cid`, by squad rank. */
const primeAt = (w: TransferWorld, cid: number, ranks: (r: number) => boolean) =>
  seniorsOf(w.players, cid).find((p, i) => {
    const age = 2026 - Number(p.birthDate.slice(0, 4));
    return ranks(i) && age >= 25 && age <= 28;
  }) as Player;

describe("valuation", () => {
  it("never sells a star for two average players' fees", () => {
    const w = freshWorld();
    const all = w.players.filter((p) => p.status === "club" && p.cid !== 0);
    const star = all.find((p) => p.ovr >= 80) as Player;
    const average = all.filter((p) => p.ovr >= 70 && p.ovr <= 72).slice(0, 2);
    const two = average.reduce((s, p) => s + askingPrice(w, p, JULY).asking, 0);
    expect(average).toHaveLength(2);
    expect(bidOutcome(two, askingPrice(w, star, JULY).asking)).toBe("rejected");
  });

  it("prices a starter above a squad player and a long contract above a final year", () => {
    const w = freshWorld();
    const cid = 5;
    setTarget(w, cid, "midTable");
    const starter = primeAt(w, cid, (r) => r < 11);
    const reserve = primeAt(w, cid, (r) => r >= 16);
    expect(ratio(w, starter, JULY)).toBeGreaterThan(1.2);
    expect(ratio(w, reserve, JULY)).toBeLessThanOrEqual(1);
    const long = { ...starter, contract: { wage: 1e6, expires: "2030-06-30" } };
    const short = { ...starter, contract: { wage: 1e6, expires: "2027-06-30" } };
    w.players = w.players.map((p) => (p.pid === starter.pid ? long : p));
    const longAsk = askingPrice(w, long, JULY).asking;
    w.players = w.players.map((p) => (p.pid === starter.pid ? short : p));
    expect(askingPrice(w, short, JULY).asking).toBeLessThan(0.7 * longAsk);
  });

  it("makes a contender ask a premium for a starter, more in January; a seller takes less", () => {
    const w = freshWorld();
    const cid = 1;
    setTarget(w, cid, "title");
    const starter = primeAt(w, cid, (r) => r < 11);
    const summer = ratio(w, starter, JULY);
    expect(askingPrice(w, starter, JULY).strategy).toBe("contending");
    expect(ratio(w, starter, JANUARY)).toBeGreaterThan(summer);
    (w.clubs.find((c) => c.cid === cid) as Club).cash = -1;
    expect(askingPrice(w, starter, JULY).strategy).toBe("selling");
    expect(ratio(w, starter, JULY)).toBeLessThan(summer);
  });

  it("accepts at the asking price, counters from 80% of it, rejects below", () => {
    expect(bidOutcome(10_000_000, 10_000_000)).toBe("accepted");
    expect(bidOutcome(8_000_000, 10_000_000)).toBe("countered");
    expect(bidOutcome(7_900_000, 10_000_000)).toBe("rejected");
  });
});

describe("budgets and mood", () => {
  it("splits the FFP headroom between fees and wages, and freezes on negative cash", () => {
    const w = freshWorld();
    const club = w.clubs[3] as Club;
    club.cash = 10 * club.revenueAnchor; // plenty: the FFP headroom binds
    const half = clubBudgets(w, club);
    expect(half.wageRoom).toBeGreaterThan(0);
    expect(half.transfer).toBeCloseTo(half.wageRoom * 4, -2);
    const allWages = clubBudgets(w, club, 1);
    expect(allWages.transfer).toBe(0);
    expect(allWages.wageRoom).toBeCloseTo(2 * half.wageRoom, -2);
    club.cash = -1;
    expect(clubBudgets(w, club).transfer).toBe(0);
  });

  it("keeps ambition subtle: a star moving well down loses at most a little mood", () => {
    const w = freshWorld();
    const star = w.players.find((p) => p.status === "club" && p.ovr >= 82) as Player;
    const weakest = [...w.clubs].sort((a, b) => a.strengthTarget - b.strengthTarget)[0] as Club;
    const { byClub } = clubLevels(w, JULY);
    const strongest = [...w.clubs].sort(
      (a, b) => (byClub.get(b.cid) ?? 0) - (byClub.get(a.cid) ?? 0),
    )[0] as Club;
    const down = moodToward(w, { ...star, moodTraits: [] }, weakest, JULY);
    expect(down.components.ambition).toBeLessThan(-0.5);
    const season = w.clubSeasons.get(weakest.cid) as ClubSeason;
    const without = playerMood(
      { ...star, moodTraits: [] },
      {
        club: weakest,
        season,
        success: season.boardConfidence ?? 50,
        minutesShare: 0.8,
        yearsAtClub: 0,
      },
    );
    expect(without.value - down.value).toBeGreaterThan(0);
    expect(without.value - down.value).toBeLessThanOrEqual(0.1);
    const fame = moodToward(w, { ...star, moodTraits: ["fame"] }, weakest, JULY);
    expect(fame.components.ambition).toBe(down.components.ambition);
    // No one outgrows the strongest club.
    expect(moodToward(w, star, strongest, JULY).components.ambition).toBe(-0);
  });
});

describe("completing a deal", () => {
  it("moves the player, the fee and the books, and tells the user", () => {
    const w = freshWorld();
    const p = seniorsOf(w.players, 4)[5] as Player;
    const buyer = w.clubs[0] as Club;
    const seller = w.clubs[4] as Club;
    const [buyerCash, sellerCash] = [buyer.cash, seller.cash];
    const log = completeTransfer(w, {
      pid: p.pid,
      toCid: 0,
      fee: 20_000_000,
      wage: 3_000_000,
      expires: "2030-06-30",
      date: JULY,
      season: 2026,
    });
    expect(p).toMatchObject({ cid: 0, status: "club", contract: { wage: 3_000_000 } });
    expect(p.feeBalance).toEqual({ remaining: 20_000_000, perYear: 5_000_000 });
    expect(p.transfers.at(-1)).toMatchObject({ fromCid: 4, toCid: 0, fee: 20_000_000 });
    expect(p.shirtNumber).not.toBeNull();
    expect(buyer.cash).toBe(buyerCash - 20_000_000);
    expect(seller.cash).toBe(sellerCash + 20_000_000);
    const sellerRow = w.clubSeasons.get(4) as ClubSeason;
    expect(sellerRow.revenue.playerSales).toBe(20_000_000);
    expect(operatingRevenue(sellerRow.revenue)).toBe(0);
    expect(w.clubSeasons.get(0)?.expenses.transfers).toBe(20_000_000);
    expect(log.transactions[0]).toMatchObject({ type: "transfer", cids: [4, 0] });
    expect(log.messages[0]?.subject).toMatch(/^Signed /);
  });
});
