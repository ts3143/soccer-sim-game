import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { TradeProposal } from "../../common/api";
import { createLeague, openLeague } from "./session";
import { makeTradeWork, proposeTrade } from "./trade";

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
