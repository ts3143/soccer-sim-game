import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta, Offer, Player } from "../../common/schema";
import { askingPrice, seniorsOf } from "../market/transfers";
import { loopWorld, play } from "./game";
import { bidForPlayer, contractTalks, respondToOffer, signPlayer, userOffers } from "./market";
import { createLeague, openLeague, type LeagueSession } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// A new league each: a few seconds locally, more on CI.
const SLOW = { timeout: 180_000 };

/** An AI club's player the user can afford and who would join (willing, wage in room). */
function target(session: LeagueSession): Player {
  const world = loopWorld(session, 2026);
  const candidates = world.players
    .filter((p) => p.status === "club" && p.cid !== 0 && p.ovr >= 60 && p.ovr <= 66)
    .sort((a, b) => a.pid - b.pid);
  for (const p of candidates) {
    const talks = contractTalks(session, p.pid);
    const asking = askingPrice(world, p, "2026-07-01").asking;
    const wage = talks.asks.find((a) => a.years === 3)?.wage ?? Infinity;
    if (talks.mood.willing && asking <= talks.budget.transfer && wage <= talks.budget.wageRoom)
      return p;
  }
  throw new Error("No affordable target");
}

describe("the user's transfers", () => {
  it("agrees a fee in steps, then signs the player on his terms", SLOW, async () => {
    const league = await createLeague({ name: "Market", seed: "market-save", userCid: 0 });
    const session = await openLeague(league.lid);
    const p = target(session);
    const talks = contractTalks(session, p.pid);
    expect(talks).toMatchObject({ kind: "transfer", feeAgreed: null, userPlayer: false });
    expect(talks.budget.transfer).toBeGreaterThan(0);
    await expect(signPlayer(session, p.pid, 3)).rejects.toThrow(/Agree a fee/);

    const asking = askingPrice(loopWorld(session, 2026), p, "2026-07-01").asking;
    expect((await bidForPlayer(session, p.pid, Math.round(asking * 0.5))).outcome).toBe("rejected");
    const counter = await bidForPlayer(session, p.pid, Math.round(asking * 0.9));
    expect(counter).toMatchObject({ outcome: "countered", counter: asking });
    const accepted = await bidForPlayer(session, p.pid, asking);
    expect(accepted.outcome).toBe("accepted");
    expect(accepted.talks.feeAgreed).toBe(asking);

    const seller = p.cid as number;
    const cash = [0, seller].map((cid) => session.cache.get("clubs", cid)?.cash ?? 0);
    await signPlayer(session, p.pid, 3);
    const signed = session.cache.get("players", p.pid);
    expect(signed).toMatchObject({ cid: 0, status: "club", contract: { expires: "2029-06-30" } });
    expect(signed?.feeBalance?.remaining).toBe(asking);
    expect(session.cache.get("clubs", 0)?.cash).toBe((cash[0] ?? 0) - asking);
    expect(session.cache.get("clubs", seller)?.cash).toBe((cash[1] ?? 0) + asking);
    expect(session.cache.getAll("transactions").at(-1)).toMatchObject({
      type: "transfer",
      fee: asking,
    });
    expect(session.cache.getAll("inbox").some((m) => m.subject.startsWith("Signed "))).toBe(true);
    expect(userOffers(session).map((o) => o.status)).toEqual(["completed", "rejected", "rejected"]);

    // A free agent signs straight away, on a free.
    const free = session.cache
      .getAll("players")
      .filter((x) => x.status === "freeAgent" && x.ovr >= 50)
      .find((x) => {
        const t = contractTalks(session, x.pid);
        return t.mood.willing && (t.asks[1]?.wage ?? Infinity) <= t.budget.wageRoom;
      }) as Player;
    expect(contractTalks(session, free.pid).kind).toBe("freeAgent");
    await signPlayer(session, free.pid, 2);
    expect(session.cache.get("players", free.pid)).toMatchObject({ cid: 0, feeBalance: null });

    // Saved: read back after closing the save.
    const { db } = await openLeague(league.lid);
    expect((await db.get("players", p.pid))?.cid).toBe(0);
    expect((await db.getAll("offers")).length).toBe(3);
  });

  it(
    "answers bids for the user's players, and lets bids lapse when the window closes",
    SLOW,
    async () => {
      const league = await createLeague({ name: "Bids", seed: "market-bids", userCid: 0 });
      const session = await openLeague(league.lid);
      const mine = seniorsOf(session.cache.getAll("players"), 0);
      const [kept, sold] = [mine[3] as Player, mine[8] as Player];
      // Bids from the richest club, as chunk 5's AI will make them.
      const buyer = [...session.cache.getAll("clubs")]
        .filter((c) => c.cid !== 0)
        .sort((a, b) => b.revenueAnchor - a.revenueAnchor)[0];
      const bid = (oid: number, pid: number): Offer => ({
        oid,
        pid,
        fromCid: buyer?.cid ?? 1,
        toCid: 0,
        kind: "transfer",
        status: "open",
        fee: 5_000_000,
        expires: "2026-08-31",
        date: "2026-07-01",
        season: 2026,
      });
      session.cache.put("offers", bid(900, kept.pid));
      session.cache.put("offers", bid(901, sold.pid));
      await respondToOffer(session, 900, false);
      expect(session.cache.get("offers", 900)?.status).toBe("rejected");
      expect(session.cache.get("players", kept.pid)?.cid).toBe(0);
      const cash = session.cache.get("clubs", 0)?.cash ?? 0;
      await respondToOffer(session, 901, true);
      const after = session.cache.get("offers", 901)?.status;
      if (after === "completed") {
        expect(session.cache.get("players", sold.pid)?.cid).toBe(buyer?.cid);
        expect(session.cache.get("clubs", 0)?.cash).toBe(cash + 5_000_000);
        expect(session.cache.getAll("inbox").some((m) => m.subject.startsWith("Sold "))).toBe(true);
      } else {
        expect(after).toBe("rejected");
        expect(session.cache.getAll("inbox").some((m) => m.subject.endsWith(" stays"))).toBe(true);
      }
      await expect(respondToOffer(session, 901, true)).rejects.toThrow(/No open bid/);

      // A fee agreed in the window lapses once deadline day is played.
      const p = target(session);
      const asking = askingPrice(loopWorld(session, 2026), p, "2026-07-01").asking;
      expect((await bidForPlayer(session, p.pid, asking)).outcome).toBe("accepted");
      await play(session, "untilWindowCloses");
      expect(userOffers(session).find((o) => o.pid === p.pid)?.status).toBe("expired");
      expect((session.cache.get("meta", "game") as GameMeta).date).toBe("2026-08-31");
      await expect(bidForPlayer(session, p.pid, asking)).rejects.toThrow(/window is closed/);
      await expect(signPlayer(session, p.pid, 3)).rejects.toThrow(/window is closed/);
    },
  );
});
