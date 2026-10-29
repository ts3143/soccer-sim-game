import { describe, expect, it } from "vitest";
import { type WorldConfig, worlds } from "../../common/config/worlds";
import type { Club, Fixture, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { aiRenewals } from "../market/renewals";
import { playoffId } from "../season/season";
import { closeSeasonBooks, type FinanceWorld, prizeIncome, settleMonths } from "./finance";
import {
  applyCapGrace,
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

  describe("in the season", () => {
    const sl = generateWorld({
      config: worlds.superLeague,
      seed: "soft-cap-test",
      name: "t",
      userCid: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const fresh = (): FinanceWorld & { clubs: Club[]; players: Player[] } => ({
      config: worlds.superLeague,
      clubs: structuredClone(sl.clubs),
      players: structuredClone(sl.players),
      clubSeasons: new Map(structuredClone(sl.clubSeasons).map((r) => [r.cid, r])),
    });

    it("taxes a club over its cap at season end, shares it in its tier, runs no FFP", () => {
      const w = fresh();
      // Club 0 (Star) €10m over the cap; everyone else as generated (85–100% of the cap).
      const star = w.players.filter((p) => p.cid === 0 && p.status === "club");
      const over = STAR + 10_000_000 - payroll(w.clubs[0] as Club, w.players, "2027-06-30");
      (star[0] as Player).contract = {
        wage: ((star[0] as Player).contract?.wage ?? 0) + over,
        expires: "2029-06-30",
      };
      const control = fresh();
      closeSeasonBooks(control, 2026, "2027-06-29", -1, config);
      const close = closeSeasonBooks(w, 2026, "2027-06-29", -1, config);
      expect(close.tax.paid).toEqual(new Map([[0, 15_000_000]]));
      const shares = [...close.tax.shared.values()];
      expect(shares.reduce((a, b) => a + b, 0)).toBe(15_000_000);
      const starClubs = new Set(w.clubs.filter((c) => c.leagueId === "STAR").map((c) => c.cid));
      expect([...close.tax.shared.keys()].every((cid) => starClubs.has(cid))).toBe(true);
      expect(w.clubSeasons.get(0)?.expenses.luxuryTax).toBe(15_000_000);
      const receiver = [...close.tax.shared.keys()][0] as number;
      expect(w.clubSeasons.get(receiver)?.revenue.taxShare).toBe(close.tax.shared.get(receiver));
      // The tax (and June's share of the higher wage) comes out of its cash.
      expect((control.clubs[0]?.cash ?? 0) - (w.clubs[0]?.cash ?? 0)).toBeGreaterThan(15_000_000);
      // FFP is off: no breaches, no bans.
      expect([close.breaches, close.bans]).toEqual([[], []]);
    });

    it("flags a relegated club still over its own cap the season after its grace", () => {
      /** A Gold club with the given grace and a payroll €10m over Gold's cap (under Star's). */
      const goldWorld = (through: number) => {
        const w = fresh();
        const club = w.clubs.find((c) => c.leagueId === "GOLD") as Club;
        club.capGrace = { leagueId: "STAR", through };
        const first = w.players.find((p) => p.cid === club.cid && p.status === "club") as Player;
        const extra = GOLD + 10_000_000 - payroll(club, w.players, "2027-06-30");
        first.contract = { wage: (first.contract?.wage ?? 0) + extra, expires: "2029-06-30" };
        return { w, cid: club.cid };
      };
      // Grace over (through 2025): measured against Gold's cap at the 2026 close.
      const after = goldWorld(2025);
      const close = closeSeasonBooks(after.w, 2026, "2027-06-29", -1, config);
      expect(close.tax.paid.get(after.cid)).toBe(15_000_000);
      expect(close.tax.afterGrace).toEqual([after.cid]);
      // Still in its grace (through 2026): Star's cap applies, so no tax.
      const during = goldWorld(2026);
      const graced = closeSeasonBooks(during.w, 2026, "2027-06-29", -1, config);
      expect(graced.tax.paid.has(during.cid)).toBe(false);
      expect(graced.tax.afterGrace).toEqual([]);
    });

    it("prices the AI's re-signings against the cap, not the club's revenue", () => {
      // Madrid Blancos earns about 7x Star's cap: priced on revenue, it re-signs dearer.
      const renewedWages = (config: WorldConfig) => {
        const w = { ...fresh(), config, userCid: -1 };
        const log = aiRenewals(w, 2026, "2026-07-01", "summer");
        return log.transactions
          .filter((t) => t.cids[0] === 0)
          .map((t) => w.players.find((p) => p.pid === t.pids[0])?.contract?.wage ?? 0);
      };
      const capped = renewedWages(worlds.superLeague);
      const uncapped = renewedWages({
        ...worlds.superLeague,
        competitions: { ...config, softCap: null },
      });
      expect(capped.length).toBeGreaterThan(0);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      expect(sum(capped)).toBeLessThan(sum(uncapped));
    });

    it("re-signs as the re-signing period closes: contracts that ended, within the cap", () => {
      const w = { ...fresh(), userCid: 0 };
      const ended = new Set(
        w.players.filter((p) => p.contract?.expires === "2027-06-30").map((p) => p.pid),
      );
      const stayed = (cid: number) =>
        w.players.filter((p) => p.cid === cid && (p.contract?.expires ?? "") > "2027-06-30");
      const before = new Map(w.clubs.map((c) => [c.cid, payroll(c, stayed(c.cid), "2027-07-01")]));
      const log = aiRenewals(w, 2027, "2027-07-01", "resigning");
      expect(log.transactions.length).toBeGreaterThan(20);
      expect(log.transactions.every((t) => ended.has(t.pids[0] ?? -1))).toBe(true);
      expect(log.transactions.some((t) => t.cids[0] === 0)).toBe(false);
      // A club's re-signings take its payroll at most to its cap plus the core allowance.
      for (const club of w.clubs) {
        const limit = (clubCap(config, club, 2027) ?? 0) * (1 + softCap.coreOverCap);
        const after = payroll(club, stayed(club.cid), "2027-07-01");
        expect(after).toBeLessThanOrEqual(Math.max(limit, before.get(club.cid) ?? 0));
      }
    });

    it("a relegated club re-signs against its own tier's cap, its grace season too", () => {
      // A Gold club relegated from Star: through its grace (2027) and the season after,
      // its re-signings fit Gold's cap, as once it's back to normal (grace long over).
      const resigned = (capGrace: Club["capGrace"]) => {
        const w = { ...fresh(), userCid: -1 };
        const club = w.clubs.find((c) => c.leagueId === "GOLD") as Club;
        club.capGrace = capGrace;
        // Wages at Star's level: €30m more for the players who stay.
        const stay = w.players.filter(
          (p) => p.cid === club.cid && (p.contract?.expires ?? "") > "2027-06-30",
        );
        for (const p of stay.slice(0, 3)) {
          if (p.contract) p.contract = { ...p.contract, wage: p.contract.wage + 10_000_000 };
        }
        return aiRenewals(w, 2027, "2027-07-01", "resigning")
          .transactions.filter((t) => t.cids[0] === club.cid)
          .map((t) => t.pids[0]);
      };
      const own = resigned(null);
      expect(resigned({ leagueId: "STAR", through: 2027 })).toEqual(own);
      expect(resigned({ leagueId: "STAR", through: 2026 })).toEqual(own);
      // Against Star's cap (the grace's, as before SL5) it would have re-signed more.
      const club = fresh().clubs.find((c) => c.leagueId === "GOLD") as Club;
      const asStar = (() => {
        const w = { ...fresh(), userCid: -1 };
        const c = w.clubs.find((x) => x.cid === club.cid) as Club;
        c.leagueId = "STAR";
        const stay = w.players.filter(
          (p) => p.cid === c.cid && (p.contract?.expires ?? "") > "2027-06-30",
        );
        for (const p of stay.slice(0, 3)) {
          if (p.contract) p.contract = { ...p.contract, wage: p.contract.wage + 10_000_000 };
        }
        return aiRenewals(w, 2027, "2027-07-01", "resigning").transactions.filter(
          (t) => t.cids[0] === c.cid,
        ).length;
      })();
      expect(asStar).toBeGreaterThan(own.length);
    });

    it("pays no Youth dial where clubs have no academies", () => {
      const w = fresh();
      settleMonths(w, "2026-07-01", "2026-09-30", config);
      const row = w.clubSeasons.get(0);
      expect(row?.expenses.youth ?? 0).toBe(0);
      expect(row?.expenses.coaching ?? 0).toBeGreaterThan(0);
    });

    it("pays play-off prize money per round won and to the beaten finalist", () => {
      const w = fresh();
      const final = {
        competition: playoffId("STAR"),
        round: "Final",
        leg: null,
        homeCid: 0,
        awayCid: 1,
        result: { winnerCid: 1 },
      } as unknown as Fixture;
      prizeIncome(w, final, config);
      expect(w.clubSeasons.get(1)?.revenue.prize).toBe(20_000_000);
      expect(w.clubSeasons.get(0)?.revenue.prize).toBe(10_000_000);
    });

    it("gives relegated clubs their grace, and nobody else", () => {
      const clubs = structuredClone(sl.clubs);
      applyCapGrace(
        clubs,
        [
          { cid: 14, from: "STAR", to: "GOLD", reason: "relegated" },
          { cid: 16, from: "GOLD", to: "STAR", reason: "promoted" },
        ],
        config,
        2026,
      );
      expect(clubs[14]?.capGrace).toEqual({ leagueId: "STAR", through: 2027 });
      expect(clubs[16]?.capGrace).toBeUndefined();
    });
  });
});
