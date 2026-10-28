import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { TradeProposal } from "../../common/api";
import { createLeague, openLeague } from "./session";
import { gameState, play } from "./game";
import { bidForPlayer, contractTalks, listPlayer, proposeLoan } from "./market";
import { makeTradeWork, proposeTrade, respondToTradeOffer, tradingBlock } from "./trade";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

const SLOW = { timeout: 120_000 };
const none = () => ({ pids: [], picks: [] });

describe("the user's trades in a save", () => {
  it("are refused, made to work, then made; rules come back as reasons", SLOW, async () => {
    const league = await createLeague({
      world: "superLeague",
      name: "Trades",
      seed: "super-league-trades",
      userCid: 39, // Lyon Gones (Blue)
    });
    const session = await openLeague(league.lid);
    const squad = (cid: number) =>
      session.cache
        .getAll("players")
        .filter((p) => p.cid === cid && p.status === "club")
        .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    // A Blue rival's fifth-best player, for nothing: no.
    const target = squad(40)[4];
    if (!target) throw new Error("No player");
    const ask: TradeProposal = { cid: 40, give: none(), get: { pids: [target.pid], picks: [] } };
    const no = await proposeTrade(session, ask);
    expect([no.accepted, no.message]).toEqual([false, expect.stringMatching(/turn it down/)]);
    // What would make it work: some of Lyon's players or picks.
    const work = makeTradeWork(session, ask);
    expect(work.message).toMatch(/would do it if you add/);
    const proposal = work.proposal;
    if (!proposal) throw new Error("No deal");
    expect(proposal.get).toEqual(ask.get);
    const given = proposal.give;
    expect(given.pids.length + given.picks.length).toBeGreaterThan(0);
    const answer = await proposeTrade(session, proposal);
    expect([answer.accepted, answer.message]).toEqual([
      true,
      expect.stringMatching(/^Trade done with/),
    ]);
    expect(session.cache.get("players", target.pid)?.cid).toBe(39);
    for (const pid of given.pids) expect(session.cache.get("players", pid)?.cid).toBe(40);
    for (const pick of given.picks) {
      expect(
        session.cache.get("draftPicks", [pick.season, pick.round, pick.originalCid])?.cid,
      ).toBe(40);
    }
    const trade = session.cache.getAll("transactions").find((t) => t.type === "trade");
    expect(trade?.cids).toEqual([39, 40]);
    // Saved, not just in memory.
    expect((await session.db.get("players", target.pid))?.cid).toBe(39);

    // A player who isn't his: the reason, not a trade.
    const other = squad(41)[0];
    const wrong = await proposeTrade(session, {
      cid: 40,
      give: { pids: [other?.pid ?? -1], picks: [] },
      get: none(),
    });
    expect([wrong.accepted, wrong.message]).toEqual([
      false,
      expect.stringMatching(/can't trade a player not in its squad/),
    ]);
    await expect(proposeTrade(session, { ...ask, cid: 39 })).rejects.toThrow(/another club/);
  });

  it("the trading block, AI offers in the inbox; no transfer market, no loans", SLOW, async () => {
    const league = await createLeague({
      world: "superLeague",
      name: "Block",
      seed: "super-league-block",
      userCid: 39,
    });
    const session = await openLeague(league.lid);
    const squad = (cid: number) =>
      session.cache
        .getAll("players")
        .filter((p) => p.cid === cid && p.status === "club")
        .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    // The transfer market and loans are off in this world.
    const theirs = squad(40)[0];
    const mine = squad(39)[0];
    if (!theirs || !mine) throw new Error("Squads");
    await expect(bidForPlayer(session, theirs.pid, 1_000_000)).rejects.toThrow(
      /no transfer market in this world/,
    );
    await expect(listPlayer(session, mine.pid, 1_000_000)).rejects.toThrow(/no transfer market/);
    await expect(proposeLoan(session, mine.pid, 40, "season", 0.5)).rejects.toThrow(/no loans/);
    expect(contractTalks(session, theirs.pid).closedReason).toMatch(/move by trades/);

    // The trading block: offers for his youngest player, each a trade the club takes.
    const young = [...squad(39)].sort((a, b) => (a.birthDate < b.birthDate ? 1 : -1))[0];
    if (!young) throw new Error("No player");
    const put = { pids: [young.pid], picks: [] };
    const offers = tradingBlock(session, put);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(5);
    for (const o of offers) {
      expect(o.proposal?.give).toEqual(put);
      expect(
        (o.proposal?.get.pids.length ?? 0) + (o.proposal?.get.picks.length ?? 0),
      ).toBeGreaterThan(0);
      expect(o.message).toMatch(/ offer /);
    }
    const best = offers[0]?.proposal;
    if (!best) throw new Error("No offer");
    expect((await proposeTrade(session, best)).accepted).toBe(true);
    expect(() => tradingBlock(session, { pids: [], picks: [] })).toThrow(/at least one/);

    // AI clubs' offers come to his inbox on trade days; one stands at a time.
    await play(session, "untilNextMatch");
    const date = gameState(session).date;
    const offered = session.cache.getAll("inbox").filter((m) => m.tradeOffer);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((m) => (m.tradeOffer?.expires ?? "") >= date).length).toBeLessThanOrEqual(
      1,
    );
    const first = offered[0];
    const offer = first?.tradeOffer;
    if (!first || !offer) throw new Error("No offer");
    expect(offer.status).toBe("open");
    // Answered after it lapsed: it stood until its date.
    if (offer.expires < date) {
      expect((await respondToTradeOffer(session, first.mid, true)).message).toMatch(/stood until/);
    }
    // Accepted while it stands (a copy, still standing today): made if still good for them.
    session.cache.put("inbox", { ...first, mid: 99_999, tradeOffer: { ...offer, expires: date } });
    const yes = await respondToTradeOffer(session, 99_999, true);
    if (yes.accepted) {
      expect(yes.message).toMatch(/^Trade done with/);
      for (const pid of offer.give.pids) {
        expect(session.cache.get("players", pid)?.cid).toBe(offer.cid);
      }
      expect(session.cache.get("inbox", 99_999)?.tradeOffer?.status).toBe("accepted");
    } else {
      expect(yes.message).toMatch(/changed their mind|can't trade|over the|limit/);
    }
    // Turned down: answered, and can't be answered again.
    session.cache.put("inbox", { ...first, tradeOffer: { ...offer, expires: date } });
    expect(await respondToTradeOffer(session, first.mid, false)).toEqual({
      accepted: false,
      message: "You turn the offer down.",
    });
    expect(session.cache.get("inbox", first.mid)?.tradeOffer?.status).toBe("rejected");
    await expect(respondToTradeOffer(session, first.mid, true)).rejects.toThrow(/isn't open/);
  });

  it("aren't in a world with transfers", SLOW, async () => {
    const league = await createLeague({
      world: "classic",
      name: "Classic",
      seed: "classic-trades",
      userCid: 0,
    });
    const session = await openLeague(league.lid);
    await expect(proposeTrade(session, { cid: 1, give: none(), get: none() })).rejects.toThrow(
      /by transfers in this world, not trades/,
    );
  });
});
