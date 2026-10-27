import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta, Offer, Player } from "../../common/schema";
import { askingPrice, seniorsOf } from "../market/transfers";
import { loopWorld, play } from "./game";
import { lendable, rankAt } from "../market/loans";
import { getClubFinances } from "../views/club";
import { getDashboard } from "../views/dashboard";
import { getTransferMarket, searchPlayers } from "../views/market";
import {
  bidForPlayer,
  contractTalks,
  proposeLoan,
  respondToOffer,
  setWageShare,
  signPlayer,
  userOffers,
} from "./market";
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
    const league = await createLeague({
      world: "classic",
      name: "Market",
      seed: "market-save",
      userCid: 0,
    });
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

  it("links bid messages to their offers in the Dashboard's inbox", SLOW, async () => {
    const league = await createLeague({
      world: "classic",
      name: "Inbox bids",
      seed: "inbox-bids",
      userCid: 0,
    });
    const session = await openLeague(league.lid);
    const [a, b] = seniorsOf(session.cache.getAll("players"), 0) as [Player, Player];
    const [x, y] = session.cache.getAll("clubs").filter((c) => c.cid !== 0);
    const offer = (oid: number, pid: number, fromCid: number): Offer => ({
      oid,
      pid,
      fromCid,
      toCid: 0,
      kind: "transfer",
      status: "open",
      fee: 1_000_000,
      expires: "2026-08-31",
      date: "2026-07-01",
      season: 2026,
    });
    const message = (mid: number, p: Player, subject: string, bidFrom?: number) => ({
      mid,
      date: "2026-07-01",
      season: 2026,
      kind: "transfer",
      subject,
      body: "",
      read: false,
      players: [{ pid: p.pid, name: `${p.firstName} ${p.lastName}` }],
      ...(bidFrom === undefined ? {} : { bidFrom }),
    });
    // Two clubs bid for a on the same day; b's bid message is from an older save (no club).
    session.cache.put("offers", offer(900, a.pid, x?.cid ?? 1));
    session.cache.put("offers", offer(901, a.pid, y?.cid ?? 2));
    session.cache.put("offers", offer(902, b.pid, x?.cid ?? 1));
    session.cache.put("inbox", message(900, a, "Bid for a", y?.cid));
    session.cache.put("inbox", message(901, b, "Bid for b"));
    session.cache.put("inbox", message(902, b, "Sold b"));
    session.cache.put("inbox", message(903, a, "Bid for a")); // two offers fit: no link
    const bidOf = async (mid: number) =>
      (await getDashboard(league.lid)).inbox.find((m) => m.mid === mid)?.bid;
    expect(await bidOf(900)).toEqual({ oid: 901, status: "open" });
    expect(await bidOf(901)).toEqual({ oid: 902, status: "open" });
    expect(await bidOf(902)).toBeUndefined();
    expect(await bidOf(903)).toBeUndefined();
    await respondToOffer(session, 901, false);
    expect(await bidOf(900)).toEqual({ oid: 901, status: "rejected" });
  });

  it(
    "answers bids for the user's players, and lets bids lapse when the window closes",
    SLOW,
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Bids",
        seed: "market-bids",
        userCid: 0,
      });
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
      await expect(respondToOffer(session, 901, true)).rejects.toThrow(/no longer open/);

      // Under an FFP ban the user can't bid or borrow.
      const club = session.cache.get("clubs", 0);
      if (club)
        session.cache.put("clubs", { ...club, ffp: { warned: true, bannedUntil: "2026-08-31" } });
      await expect(bidForPlayer(session, target(session).pid, 1_000_000)).rejects.toThrow(/FFP/);
      if (club) session.cache.put("clubs", club);

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

  it(
    "loans players out and in, and gets a half-season loanee back on 1 January",
    SLOW,
    async () => {
      // An ENG2 club: stronger clubs' reserves would play for it, so it can borrow.
      const USER = 21;
      const league = await createLeague({
        world: "classic",
        name: "Loans",
        seed: "market-loans",
        userCid: USER,
      });
      const session = await openLeague(league.lid);
      const world = loopWorld(session, 2026);
      const mine = seniorsOf(world.players, USER);
      const clubs = world.clubs.filter((c) => c.cid !== USER);
      // Out: a squad player to an AI club where he'd start, paying half his wage.
      const outgoing = mine[14] as Player;
      const host = clubs.find(
        (c) =>
          rankAt(seniorsOf(world.players, c.cid), outgoing) < 11 &&
          contractTalks(session, outgoing.pid).mood.willing,
      );
      const out = await proposeLoan(session, outgoing.pid, host?.cid ?? 1, "half", 0.5);
      expect(out).toMatchObject({ accepted: true });
      expect(session.cache.get("players", outgoing.pid)).toMatchObject({
        status: "loan",
        cid: host?.cid,
        loan: { parentCid: USER, until: "2027-01-01", wageShare: 0.5 },
      });
      // In: a young player another club would lend, who'd play for the user.
      const incoming = world.players.find(
        (p) =>
          p.cid !== USER &&
          p.status === "club" &&
          lendable(world, p, "2026-07-01", undefined, 23) &&
          rankAt(seniorsOf(world.players, USER), p) < 14,
      ) as Player;
      expect(incoming).toBeDefined();
      const stingy = await proposeLoan(session, incoming.pid, USER, "season", 0);
      expect(stingy).toMatchObject({ accepted: false });
      const fair = await proposeLoan(session, incoming.pid, USER, "season", 0.5);
      if (fair.accepted) {
        expect(session.cache.get("players", incoming.pid)).toMatchObject({
          status: "loan",
          cid: USER,
        });
      } else {
        expect(fair.message).toMatch(/doesn't want|wage room|full squad/);
      }
      // A loanee can't be bought, and his contract stays with his parent club.
      await expect(bidForPlayer(session, outgoing.pid, 1_000_000)).rejects.toThrow(
        /isn.t at a club you can buy from/,
      );
      expect(contractTalks(session, outgoing.pid).kind).toBe("renewal");

      await play(session, "untilEndOfSeason");
      const back = session.cache.get("players", outgoing.pid);
      expect(back).toMatchObject({ status: "club", cid: USER, loan: null });
      expect(back?.transfers.at(-1)).toMatchObject({
        type: "loan",
        date: "2027-01-01",
        toCid: USER,
      });
      expect(session.cache.getAll("inbox").some((m) => /back from loan/.test(m.subject))).toBe(
        true,
      );
    },
  );

  it(
    "feeds the Transfer Market: the user's squad, a market search, the budget control",
    SLOW,
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Market",
        seed: "club-lab",
        userCid: 0,
      });
      const session = await openLeague(league.lid);
      const view = await getTransferMarket(league.lid);
      expect(view.window).toEqual({ id: "summer", closes: "2026-08-31" });
      expect(view.squad.length).toBeGreaterThan(20);
      expect(view.squad.every((p) => p.value > 0)).toBe(true);
      expect(view.budget.squadCostRatio).toBeGreaterThan(0.3);
      expect(view.budget.squadCostRatio).toBeLessThan(0.9);
      const free = await searchPlayers(league.lid, { freeAgents: true, limit: 10 });
      expect(free).toHaveLength(10);
      expect(free.every((p) => p.club === null && p.daysFree !== null)).toBe(true);
      const keepers = await searchPlayers(league.lid, { position: "GK", minOvr: 60, maxOvr: 70 });
      expect(
        keepers.every((p) => p.position === "GK" && p.ovr >= 60 && p.ovr <= 70 && p.cid !== 0),
      ).toBe(true);
      const candidate = (await searchPlayers(league.lid, { limit: 1 }))[0]!;
      const filtered = await searchPlayers(league.lid, {
        name: candidate.name,
        nationality: candidate.nationality,
        minAge: candidate.age,
        maxAge: candidate.age,
        minPot: candidate.pot,
        maxValue: candidate.value,
        maxWage: candidate.wage,
      });
      expect(filtered.some((p) => p.pid === candidate.pid)).toBe(true);
      expect(await searchPlayers(league.lid, { name: candidate.name, maxValue: 0 })).toEqual([]);
      expect(await searchPlayers(league.lid, { name: candidate.name, maxWage: 0 })).toEqual([]);
      const expiring = await searchPlayers(league.lid, { expiring: true });
      expect(expiring.length).toBeGreaterThan(0);
      expect(expiring.every((p) => p.expires === "2027-06-30")).toBe(true);
      const eng2 = await searchPlayers(league.lid, { leagueId: "ENG2", limit: 30 });
      const eng2Clubs = new Set(
        session.cache
          .getAll("clubs")
          .filter((c) => c.leagueId === "ENG2")
          .map((c) => c.cid),
      );
      expect(eng2.every((p) => p.cid !== null && eng2Clubs.has(p.cid))).toBe(true);
      const before = await getClubFinances(league.lid);
      await setWageShare(session, 1);
      const wages = await getClubFinances(league.lid);
      expect(wages.budget.wageShare).toBe(1);
      expect(wages.budget.transfer).toBe(0);
      expect(wages.budget.wageRoom).toBeGreaterThan(before.budget.wageRoom);
      await expect(setWageShare(session, 2)).rejects.toThrow(/between 0 and 1/);
    },
  );
});
