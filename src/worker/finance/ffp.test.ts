import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, ClubSeason, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { marketDay, marketDays, type MarketWorld } from "../market/aiMarket";
import { startLoan } from "../market/loans";
import { askingPrice, completeTransfer, seniorsOf } from "../market/transfers";
import { type FinanceWorld, settleMonths } from "./finance";
import { FFP, ffpCheck, squadCostOf, transferBanned } from "./ffp";

const competitions = worlds.classic.competitions;

const generated = generateWorld({
  config: worlds.classic,
  seed: "ffp-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const freshWorld = (): MarketWorld & FinanceWorld => ({
  config: worlds.classic,
  clubs: structuredClone(generated.clubs),
  players: structuredClone(generated.players),
  clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
  userCid: 0,
  seed: "ffp-test",
  openBids: [],
});
const row = (w: FinanceWorld, cid: number) => w.clubSeasons.get(cid) as ClubSeason;
/** Books a season with a given squad cost ratio. */
const book = (r: ClubSeason, ratio: number) => {
  r.revenue = { commercial: 100_000_000 };
  r.expenses = { wages: ratio * 100_000_000 };
  r.amortisation = 0;
  r.salesProfit = 0;
};

describe("fee amortisation", () => {
  it("writes a twelfth of the yearly charge off each month, to the club holding the contract", () => {
    const w = freshWorld();
    for (const x of w.players) x.feeBalance = null;
    const [p, q] = seniorsOf(w.players, 2) as [Player, Player];
    p.feeBalance = { remaining: 12_000_000, perYear: 4_000_000 };
    q.feeBalance = { remaining: 6_000_000, perYear: 2_400_000 };
    startLoan(w, {
      pid: q.pid,
      toCid: 3,
      until: "2027-06-30",
      wageShare: 0.5,
      date: "2026-07-01",
      season: 2026,
    });
    const changed = settleMonths(w, "2026-07-01", "2026-09-30", competitions);
    expect(changed.has(p.pid) && changed.has(q.pid)).toBe(true);
    // Three month-ends at a twelfth each (whole euros).
    expect(p.feeBalance.remaining).toBeCloseTo(11_000_000, -1);
    expect(q.feeBalance.remaining).toBeCloseTo(5_400_000, -1);
    // The parent amortises its loanee; the loan club none of it.
    expect(row(w, 2).amortisation).toBeCloseTo(1_600_000, -1);
    expect(row(w, 3).amortisation ?? 0).toBe(0);
  });

  it("counts the fee less the player's balance as profit on a sale", () => {
    const w = freshWorld();
    const p = seniorsOf(w.players, 4)[6] as Player;
    p.feeBalance = { remaining: 6_000_000, perYear: 2_000_000 };
    row(w, 4).salesProfit = 0;
    completeTransfer(w, {
      pid: p.pid,
      toCid: 5,
      fee: 10_000_000,
      wage: 1e6,
      expires: "2029-06-30",
      date: "2026-07-20",
      season: 2026,
    });
    expect(row(w, 4).salesProfit).toBe(4_000_000);
    const r = row(w, 4);
    expect(squadCostOf(r).revenue).toBe(
      Object.entries(r.revenue)
        .filter(([k]) => k !== "playerSales")
        .reduce((s, [, v]) => s + v, 0) + 4_000_000,
    );
  });
});

describe("the 30 June check", () => {
  it("warns a club over 70%, bans it for the summer the second time, and clears a clean season", () => {
    const w = freshWorld();
    const user = w.clubs[0] as Club;
    book(row(w, 0), 0.75);
    const first = ffpCheck(w, 2026, 0, competitions);
    expect(row(w, 0).squadCostRatio).toBe(0.75);
    expect(user.ffp).toEqual({ warned: true, bannedUntil: null });
    expect(first.messages[0]?.subject).toBe("FFP warning");
    const second = ffpCheck(w, 2027, 0, competitions);
    expect(user.ffp?.bannedUntil).toBe("2028-08-31");
    expect(second.bans).toContain(0);
    expect(second.messages[0]?.subject).toBe("FFP: transfer ban");
    expect(transferBanned(user, "2028-08-31")).toBe(true);
    expect(transferBanned(user, "2028-09-01")).toBe(false);
    book(row(w, 0), FFP.ratio - 0.01);
    ffpCheck(w, 2028, 0, competitions);
    expect(user.ffp?.warned).toBe(false);
  });

  it("keeps a banned club out of the market and makes a warned club sell", () => {
    const w = freshWorld();
    const banned = w.clubs[8] as Club;
    banned.ffp = { warned: true, bannedUntil: "2026-08-31" };
    banned.cash = 10 * banned.revenueAnchor;
    const moves = marketDays(2026, competitions)
      .filter((d) => d.window === "summer")
      .flatMap((d) => marketDay(w, 2026, d).transactions)
      .filter((t) => t.type !== "renewal");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((t) => t.cids.at(-1) === banned.cid)).toBe(false);
    const p = seniorsOf(w.players, banned.cid)[3] as Player;
    expect(askingPrice(w, p, "2026-07-20").strategy).toBe("selling");
  });
});
