import { describe, expect, it } from "vitest";
import type { Club, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { AI_MARKET, marketDay, marketDays, type MarketWorld, needOf } from "./aiMarket";
import { freeAgentAskFactor } from "./market";
import { seniorsOf } from "./transfers";

const generated = generateWorld({
  seed: "ai-market-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const freshWorld = (): MarketWorld => ({
  clubs: structuredClone(generated.clubs),
  players: structuredClone(generated.players),
  clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
  userCid: 0,
  seed: "ai-market-test",
  openBids: [],
});
const days = marketDays(2026);
const totalCash = (w: MarketWorld) => w.clubs.reduce((s, c) => s + c.cash, 0);

describe("market days", () => {
  it("runs weekly from a week after each window opens, and on deadline day", () => {
    const summer = days.filter((d) => d.window === "summer").map((d) => d.date);
    expect(summer[0]).toBe("2026-07-08");
    expect(summer.at(-2)).toBe("2026-08-26");
    expect(summer.at(-1)).toBe("2026-08-31");
    const winter = days.filter((d) => d.window === "winter");
    expect(winter.map((d) => d.date)).toEqual([
      "2027-01-08",
      "2027-01-15",
      "2027-01-22",
      "2027-01-29",
      "2027-01-31",
    ]);
    expect(winter.at(-1)?.deadline).toBe(true);
  });
});

describe("needs", () => {
  it("fills a thin squad where it is thinnest, and upgrades only a clearly weak XI slot", () => {
    const w = freshWorld();
    const club = w.clubs[6] as Club;
    const squad = seniorsOf(w.players, club.cid);
    const keepers = squad.filter((p) => p.position === "GK");
    const thin = squad.filter((p) => p.position !== "GK" || p === keepers[0]).slice(0, 20);
    expect(needOf(club, thin)).toMatchObject({ slot: { position: "GK" }, filler: true });
    const need = needOf(club, squad);
    if (need) expect(need.filler).toBe(false);
    expect(needOf(club, [...squad, ...squad].slice(0, 25))).toBeNull(); // full: 25 seniors
  });
});

describe("a market day", () => {
  it("moves players between AI clubs within the rules, deterministically", () => {
    const w = freshWorld();
    const cash = totalCash(w);
    const before = new Map(w.clubs.map((c) => [c.cid, seniorsOf(w.players, c.cid).length]));
    let log = marketDay(w, 2026, days[0] as (typeof days)[number]);
    for (const day of days.slice(1, 4)) {
      const next = marketDay(w, 2026, day);
      log = { ...next, transactions: [...log.transactions, ...next.transactions] };
    }
    const moves = log.transactions.filter((t) => t.type === "transfer");
    expect(moves.length).toBeGreaterThan(10);
    // Fees move between clubs; nothing is created or lost.
    expect(totalCash(w)).toBe(cash);
    for (const t of moves) {
      const [from, to] = t.cids as [number, number];
      expect(to).not.toBe(0); // the AI never buys for the user's club
      expect(from).not.toBe(0); // the user's players get bids instead
      expect(seniorsOf(w.players, to).length).toBeLessThanOrEqual(25);
      expect(seniorsOf(w.players, from).length).toBeGreaterThanOrEqual(AI_MARKET.sellerKeeps);
    }
    expect(seniorsOf(w.players, 0).length).toBeLessThanOrEqual(before.get(0) ?? 0);
    // The same world and seed give the same deals.
    const again = freshWorld();
    let replay: typeof log.transactions = [];
    for (const day of days.slice(0, 4))
      replay = [...replay, ...marketDay(again, 2026, day).transactions];
    expect(replay).toEqual(log.transactions);
  });

  it("bids for the user's players through his inbox, a couple at a time, not on deadline day", () => {
    const w = freshWorld();
    // Make the user's players the obvious targets: a cheap, willing squad.
    for (const p of w.players) if (p.cid === 0) p.moodTraits = [];
    const offers = days
      .filter((d) => d.window === "summer" && !d.deadline)
      .flatMap((d) => marketDay(w, 2026, d).offers);
    for (const o of offers) {
      expect(o).toMatchObject({ toCid: 0, status: "open", expires: "2026-08-31" });
      expect(w.players.find((p) => p.pid === o.pid)?.cid).toBe(0);
    }
    expect(offers.length).toBeGreaterThan(0);
    expect(new Set(offers.map((o) => o.pid)).size).toBe(offers.length);
    expect(offers.length).toBeLessThanOrEqual(AI_MARKET.maxOpenUserBids);
    const deadline = days.find((d) => d.window === "summer" && d.deadline);
    expect(marketDay(w, 2026, deadline as (typeof days)[number]).offers).toEqual([]);
  });
});

describe("free agents", () => {
  it("ask a premium when released, less the longer they wait", () => {
    const p = {
      ...(generated.players.find((x) => x.status === "freeAgent") as Player),
      freeAgentSince: "2026-07-01",
    };
    expect(freeAgentAskFactor(p, "2026-07-01")).toBeCloseTo(1.25);
    expect(freeAgentAskFactor(p, "2026-08-01")).toBeLessThan(1.05);
    expect(freeAgentAskFactor(p, "2027-01-01")).toBeLessThan(0.65);
    expect(freeAgentAskFactor({ ...p, status: "club" }, "2027-01-01")).toBe(1);
  });
});
