/**
 * The user's market actions in a save (SPEC §7.3, §7.6): contract talks, renewals, bids,
 * signings, and answers to bids for his players. Each action runs in the save's queue
 * (with Play) and saves at once. The AI's own deals arrive in M4 chunk 5.
 *
 * A transfer has two steps: bid until his club accepts a fee (bidForPlayer), then agree
 * personal terms with the player (signPlayer). A free agent needs only the second step.
 */
import { exactAge } from "../../common/dates";
import type { BidReply, ContractTalks, LoanReply, OfferView } from "../../common/api";
import type { GameMeta, IdCounters, Offer, Player } from "../../common/schema";
import { contractClub } from "../../common/status";
import { FFP, transferBanned } from "../finance/ffp";
import {
  contractAsks,
  contractEnd,
  marketValue,
  preferredYears,
  signContract,
  yearsLeft,
} from "../market/market";
import {
  LOANS,
  type LoanLength,
  lendable,
  loanEnd,
  loansIn,
  rankAt,
  startLoan,
} from "../market/loans";
import { clubRevenue, moodAtClub } from "../market/renewals";
import {
  askingPrice,
  bidOutcome,
  clubBudgets,
  completeTransfer,
  euros,
  leagueLevel,
  moodToward,
  seniorsOf,
  TRANSFERS,
} from "../market/transfers";
import {
  loopWorld,
  meta,
  openWindow,
  queued,
  saveBooks,
  saveMessages,
  saveTransactions,
} from "./game";
import type { LeagueSession } from "./session";

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

/** The user's agreed fee for a player, if one stands. */
const agreedOffer = (session: LeagueSession, userCid: number, pid: number) =>
  session.cache
    .getAll("offers")
    .find(
      (o) =>
        o.pid === pid && o.fromCid === userCid && o.status === "accepted" && o.kind === "transfer",
    );

function nextOid(session: LeagueSession): number {
  const ids = { ...meta<IdCounters>(session, "ids") };
  const oid = ids.oid++;
  session.cache.put("meta", ids, "ids");
  return oid;
}

/** Fails unless the user can act in the market now (a window is open and he has a job). */
function marketOpen(session: LeagueSession) {
  const game = meta<GameMeta>(session, "game");
  if (game.fired) throw new Error("You have no club: accept a job offer first");
  const window = openWindow(game.date, game.season);
  if (!window) throw new Error("The transfer window is closed");
  return { game, window };
}

/** Fails while the user's club is under an FFP transfer ban (SPEC §6.4). */
function notBanned(session: LeagueSession, date: string) {
  const user = session.cache.get("clubs", meta<GameMeta>(session, "game").userCid);
  if (user && transferBanned(user, date)) {
    throw new Error(`FFP: your club can't sign anyone until ${user.ffp?.bannedUntil ?? ""}`);
  }
}

/**
 * Talks with a player: with one of the user's (a renewal), at another club (a transfer:
 * personal terms once the fee is agreed) or a free agent. His mood toward the user's club,
 * his market value and his wage ask per length.
 */
export function contractTalks(session: LeagueSession, pid: number): ContractTalks {
  const game = meta<GameMeta>(session, "game");
  const world = loopWorld(session, game.season);
  const p = session.cache.get("players", pid);
  if (!p || (p.status !== "club" && p.status !== "freeAgent" && p.status !== "loan")) {
    throw new Error(`Player ${pid} is not at a club or a free agent`);
  }
  const user = world.clubs.find((c) => c.cid === game.userCid);
  const club = world.clubs.find((c) => c.cid === p.cid);
  if (!user) throw new Error("The save has no user club");
  const kind =
    p.status === "freeAgent" ? "freeAgent" : contractClub(p) === user.cid ? "renewal" : "transfer";
  const mood =
    kind === "renewal" ? moodAtClub(world, p, game.date) : moodToward(world, p, user, game.date);
  const left = yearsLeft(p, game.date);
  const level = leagueLevel(world, (club ?? user).leagueId, game.date);
  const budgets = clubBudgets(world, user);
  return {
    pid,
    name: fullName(p),
    position: p.position,
    age: Math.floor(exactAge(p.birthDate, game.date)),
    ovr: p.ovr,
    pot: p.pot,
    kind,
    club: club?.name ?? null,
    wage: p.contract?.wage ?? 0,
    expires: p.contract?.expires ?? null,
    yearsLeft: left,
    value: marketValue(p, game.date, level),
    mood: mood ?? { value: 0, components: {}, willing: false },
    asks: contractAsks(
      p,
      game.date,
      clubRevenue(world, user),
      mood?.value ?? 0,
      kind === "renewal" && left === 1,
    ).map((a) => ({ ...a, expires: contractEnd(game.season, a.years, game.date) })),
    windowOpen: openWindow(game.date, game.season) !== null,
    userPlayer: kind === "renewal",
    feeAgreed: kind === "transfer" ? (agreedOffer(session, user.cid, pid)?.fee ?? null) : null,
    budget: {
      transfer: budgets.transfer,
      wageRoom: budgets.wageRoom,
      squadCostRatio: budgets.squadCost / Math.max(1, budgets.base),
      ffpLimit: FFP.ratio,
      warned: user.ffp?.warned ?? false,
      bannedUntil: transferBanned(user, game.date) ? (user.ffp?.bannedUntil ?? null) : null,
    },
  };
}

/** Renews one of the user's players at his ask for `years` (only in a window, SPEC §7.6). */
export function renewContract(session: LeagueSession, pid: number, years: number) {
  return queued(session, async () => {
    const game = meta<GameMeta>(session, "game");
    const talks = contractTalks(session, pid);
    if (!talks.userPlayer) throw new Error("You can only renew your own players");
    if (!talks.windowOpen) throw new Error("Contracts can only be renewed in a transfer window");
    if (!talks.mood.willing) throw new Error(`${talks.name} won't negotiate with your club`);
    const ask = talks.asks.find((a) => a.years === years);
    const p = session.cache.get("players", pid);
    if (!ask || !p) throw new Error(`No ask for ${years} years`);
    if (ask.expires <= (p.contract?.expires ?? "")) {
      throw new Error(`A renewal must run past ${p.contract?.expires ?? "the current contract"}`);
    }
    signContract(p, ask.wage, ask.expires, game.date);
    session.cache.put("players", p);
    saveTransactions(session, [
      {
        season: game.season,
        date: game.date,
        type: "renewal",
        pids: [pid],
        cids: [game.userCid],
        names: [talks.name, session.cache.get("clubs", game.userCid)?.name ?? ""],
        fee: 0,
      },
    ]);
    await session.cache.flush();
  });
}

/**
 * Bids `fee` for a player at another club. His club accepts at its asking price, counters
 * from 80% of it, and otherwise says no. An accepted fee stands until the window closes.
 */
export function bidForPlayer(session: LeagueSession, pid: number, fee: number): Promise<BidReply> {
  return queued(session, async () => {
    const { game, window } = marketOpen(session);
    const world = loopWorld(session, game.season);
    const p = session.cache.get("players", pid);
    const seller = world.clubs.find((c) => c.cid === p?.cid);
    const user = world.clubs.find((c) => c.cid === game.userCid);
    if (!p || !user || p.status !== "club" || !seller) {
      throw new Error(`Player ${pid} is not at a club you can buy from`);
    }
    if (seller.cid === user.cid) throw new Error("He is already your player");
    if (!Number.isInteger(fee) || fee <= 0) throw new Error("A bid is a whole number of euros");
    notBanned(session, game.date);
    if (agreedOffer(session, user.cid, pid)) throw new Error("A fee is already agreed");
    const budgets = clubBudgets(world, user);
    if (user.cash < 0) throw new Error("Negative cash: transfers are frozen (SPEC §6.4)");
    if (fee > budgets.transfer) {
      throw new Error(`That is over your transfer budget (${euros(budgets.transfer)})`);
    }
    const { asking } = askingPrice(world, p, game.date);
    const outcome = bidOutcome(fee, asking);
    const offer: Offer = {
      oid: nextOid(session),
      pid,
      fromCid: user.cid,
      toCid: seller.cid,
      kind: "transfer",
      status: outcome === "accepted" ? "accepted" : "rejected",
      fee,
      expires: window.closes,
      date: game.date,
      season: game.season,
    };
    session.cache.put("offers", offer);
    await session.cache.flush();
    const name = fullName(p);
    const message =
      outcome === "accepted"
        ? `${seller.name} accept ${euros(fee)} for ${name}. Agree personal terms to complete the deal.`
        : outcome === "countered"
          ? `${seller.name} want ${euros(asking)} for ${name}.`
          : `${seller.name} reject the bid: it is well short of what they want for ${name}.`;
    return {
      outcome,
      fee,
      counter: outcome === "countered" ? asking : null,
      message,
      talks: contractTalks(session, pid),
    };
  });
}

/**
 * Personal terms: signs a player for `years` at his ask, after an agreed fee (a transfer)
 * or straight away (a free agent). The wage must fit the user's wage room and the fee his
 * transfer budget; at most 25 seniors.
 */
export function signPlayer(session: LeagueSession, pid: number, years: number) {
  return queued(session, async () => {
    const { game } = marketOpen(session);
    const talks = contractTalks(session, pid);
    if (talks.kind === "renewal") throw new Error("He is already your player: renew him instead");
    notBanned(session, game.date);
    const offer = agreedOffer(session, game.userCid, pid);
    const at = session.cache.get("players", pid)?.cid ?? null;
    if (talks.kind === "transfer" && (!offer || offer.toCid !== at)) {
      throw new Error("Agree a fee with his club first");
    }
    if (!talks.mood.willing) throw new Error(`${talks.name} won't negotiate with your club`);
    const ask = talks.asks.find((a) => a.years === years);
    if (!ask) throw new Error(`No ask for ${years} years`);
    const world = loopWorld(session, game.season);
    if (seniorsOf(world.players, game.userCid).length >= TRANSFERS.maxSeniors) {
      throw new Error(`Your squad is full (${TRANSFERS.maxSeniors} seniors)`);
    }
    const fee = offer?.fee ?? 0;
    if (ask.wage > talks.budget.wageRoom) {
      throw new Error(`His wage is over your wage room (${euros(talks.budget.wageRoom)} a year)`);
    }
    if (fee > talks.budget.transfer) {
      throw new Error(`The fee is over your transfer budget (${euros(talks.budget.transfer)})`);
    }
    const log = completeTransfer(world, {
      pid,
      toCid: game.userCid,
      fee,
      wage: ask.wage,
      expires: ask.expires,
      date: game.date,
      season: game.season,
    });
    for (const p of world.players) if (log.changed.has(p.pid)) session.cache.put("players", p);
    saveBooks(session, world);
    saveTransactions(session, log.transactions);
    saveMessages(session, log.messages);
    closeOffersFor(session, pid, offer?.oid);
    await session.cache.flush();
  });
}

/** After a move: the completed offer is marked, every other bid for him lapses. */
function closeOffersFor(session: LeagueSession, pid: number, completed?: number) {
  for (const o of session.cache.getAll("offers")) {
    if (o.pid !== pid) continue;
    if (o.oid === completed) session.cache.put("offers", { ...o, status: "completed" });
    else if (o.status === "open" || o.status === "accepted") {
      session.cache.put("offers", { ...o, status: "expired" });
    }
  }
}

/**
 * Accepts or rejects a bid for one of the user's players. On acceptance the player agrees
 * terms with the buyer at his ask, or turns the move down.
 */
export function respondToOffer(session: LeagueSession, oid: number, accept: boolean) {
  return queued(session, async () => {
    const { game } = marketOpen(session);
    const offer = session.cache.get("offers", oid);
    if (!offer || offer.status !== "open" || offer.toCid !== game.userCid) {
      throw new Error(`No open bid ${oid} for your players`);
    }
    if (!accept) {
      session.cache.put("offers", { ...offer, status: "rejected" });
      await session.cache.flush();
      return;
    }
    const world = loopWorld(session, game.season);
    const p = world.players.find((x) => x.pid === offer.pid);
    const buyer = world.clubs.find((c) => c.cid === offer.fromCid);
    if (!p || !buyer || p.cid !== game.userCid) throw new Error("That bid no longer stands");
    const mood = moodToward(world, p, buyer, game.date);
    const asks = contractAsks(p, game.date, clubRevenue(world, buyer), mood.value, false);
    const years = preferredYears(exactAge(p.birthDate, game.date));
    const ask = asks.find((a) => a.years === years);
    const turnedDown =
      !mood.willing ||
      !ask ||
      seniorsOf(world.players, buyer.cid).length >= TRANSFERS.maxSeniors ||
      clubBudgets(world, buyer).transfer < offer.fee;
    if (turnedDown) {
      session.cache.put("offers", { ...offer, status: "rejected" });
      saveMessages(session, [
        {
          date: game.date,
          season: game.season,
          kind: "transfer",
          subject: `${fullName(p)} stays`,
          body: `The move to ${buyer.name} fell through: ${mood.willing ? `${buyer.name} pulled out` : `${fullName(p)} turned down their terms`}.`,
          read: false,
        },
      ]);
      await session.cache.flush();
      return;
    }
    const log = completeTransfer(world, {
      pid: p.pid,
      toCid: buyer.cid,
      fee: offer.fee,
      wage: ask.wage,
      expires: contractEnd(game.season, years, game.date),
      date: game.date,
      season: game.season,
    });
    for (const x of world.players) if (log.changed.has(x.pid)) session.cache.put("players", x);
    saveBooks(session, world);
    saveTransactions(session, log.transactions);
    saveMessages(session, log.messages);
    closeOffersFor(session, p.pid, offer.oid);
    await session.cache.flush();
  });
}

/** The user's bids this season and the bids for his players. */
export function userOffers(session: LeagueSession): OfferView[] {
  const game = meta<GameMeta>(session, "game");
  const clubName = (cid: number | null) =>
    cid === null ? "Free agent" : (session.cache.get("clubs", cid)?.name ?? "?");
  return session.cache
    .getAll("offers")
    .filter((o) => o.fromCid === game.userCid || o.toCid === game.userCid)
    .sort((a, b) => b.oid - a.oid)
    .map((o) => {
      const p = session.cache.get("players", o.pid);
      return {
        oid: o.oid,
        pid: o.pid,
        name: p ? fullName(p) : "?",
        from: clubName(o.fromCid),
        to: clubName(o.toCid),
        fee: o.fee,
        status: o.status,
        expires: o.expires,
        incoming: o.toCid === game.userCid,
      };
    });
}

/**
 * Proposes a loan (SPEC §7.4): one of the user's players to an AI club (`cid`), or an AI
 * club's player to the user's club (`cid` = his club). `wageShare` is the loan club's
 * share of the wage (0, 0.5 or 1). An AI club borrows a player who'd rank in its best 14,
 * paying at most half his wage (all of it for one who'd start); it lends a young player
 * (23 or under) outside its best 16 who'd play for the user, for at least half.
 */
export function proposeLoan(
  session: LeagueSession,
  pid: number,
  cid: number,
  length: LoanLength,
  wageShare: number,
): Promise<LoanReply> {
  return queued(session, async () => {
    const { game } = marketOpen(session);
    if (![0, 0.5, 1].includes(wageShare)) throw new Error("The wage share is 0, 50 or 100%");
    const world = loopWorld(session, game.season);
    const p = world.players.find((x) => x.pid === pid);
    const to = world.clubs.find((c) => c.cid === cid);
    if (!p || !to || p.status !== "club" || p.cid === null) {
      throw new Error(`Player ${pid} can't go on loan now`);
    }
    if (p.cid === cid) throw new Error("He is already at that club");
    const out = p.cid === game.userCid;
    if (!out && cid !== game.userCid) throw new Error("You can only loan players in or out");
    if (!out) notBanned(session, game.date);
    const name = fullName(p);
    const refuse = (message: string): LoanReply => ({ accepted: false, message });
    const squad = seniorsOf(world.players, cid);
    const wage = (p.contract?.wage ?? 0) * wageShare;
    const budgets = clubBudgets(world, to);
    const rank = rankAt(squad, p);
    let reply: LoanReply | null = null;
    if (squad.length >= TRANSFERS.maxSeniors) reply = refuse(`${to.name} have a full squad`);
    else if (loansIn(world.players, cid) >= LOANS.maxIn)
      reply = refuse(`${to.name} already have ${LOANS.maxIn} loanees`);
    else if (wage > budgets.wageRoom) reply = refuse(`The wage is over ${to.name}'s wage room`);
    else if (!moodToward(world, p, to, game.date).willing)
      reply = refuse(`${name} doesn't want to join ${to.name}`);
    else if (out) {
      if (rank >= LOANS.playsIfRankBelow) reply = refuse(`${to.name} don't see him playing`);
      else if (wageShare > 0.5 && rank >= 11)
        reply = refuse(`${to.name} would pay half his wage at most`);
    } else {
      const parent = world.clubs.find((c) => c.cid === p.cid);
      if (!lendable(world, p, game.date, undefined, LOANS.userMaxAge))
        reply = refuse(`${parent?.name ?? "His club"} won't lend him`);
      else if (rank >= LOANS.playsIfRankBelow)
        reply = refuse(
          `${parent?.name ?? "His club"} want him to play: he'd be a reserve with you`,
        );
      else if (wageShare < 0.5)
        reply = refuse(`${parent?.name ?? "His club"} want at least half his wage paid`);
    }
    if (reply) return reply;
    const until = loanEnd(game.season, game.date, length);
    const log = startLoan(world, {
      pid,
      toCid: cid,
      until,
      wageShare,
      date: game.date,
      season: game.season,
    });
    for (const x of world.players) if (log.changed.has(x.pid)) session.cache.put("players", x);
    saveTransactions(session, log.transactions);
    saveMessages(session, log.messages);
    for (const o of session.cache.getAll("offers")) {
      if (o.pid === pid && (o.status === "open" || o.status === "accepted")) {
        session.cache.put("offers", { ...o, status: "expired" });
      }
    }
    await session.cache.flush();
    return { accepted: true, message: `${name} joins ${to.name} on loan until ${until}.` };
  });
}
