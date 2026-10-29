/**
 * The user's trades (SPEC §17.6): he puts a trade to an AI club, which says yes when it
 * raises its value, and can ask it what would make a trade work; he answers AI clubs'
 * offers in his inbox, and puts players and picks on the trading block for offers. The
 * Trade and Trading Block pages are SL7's.
 */
import type { TradeAnswer, TradeAssets, TradeProposal, TradeWork } from "../../common/api";
import { formatDay } from "../../common/dates";
import { GameError } from "../../common/errors";
import type { GameMeta } from "../../common/schema";
import {
  aiAccepts,
  applyTrade,
  bestOffer,
  makeItWork,
  pickLabel,
  type Trade,
  tradeCalendar,
  tradeProblems,
  tradesClosed,
  tradeValueFor,
  untradablePlayer,
} from "../market/trades";
import { type TradeDay, tradeDay, type TradeWorld } from "../market/tradeValue";
import { fullName, type LoopWorld } from "../season/offseason";
import { playedTables, seasonFixtures } from "../views/common";
import { assertNotLive, loopWorld, meta, queued, savePicks, saveTransactions } from "./game";
import type { LeagueSession } from "./session";

interface TradeSetup {
  game: GameMeta;
  world: LoopWorld & TradeWorld;
  day: TradeDay;
  cal: ReturnType<typeof tradeCalendar>;
  trade: Trade;
}

/** The save as trades read it, and the proposal as a trade (the user is club a). */
function setup(session: LeagueSession, proposal: TradeProposal): TradeSetup {
  if (session.config.switches.market !== "trades") {
    throw new GameError("Players move by transfers in this world, not trades.");
  }
  const game = meta<GameMeta>(session, "game");
  if (game.fired) {
    throw new GameError("You have no club right now: take one of your job offers first.");
  }
  if (!session.cache.get("clubs", proposal.cid) || proposal.cid === game.userCid) {
    throw new GameError("Pick another club to trade with.");
  }
  const loop = loopWorld(session, game.season);
  const world = { ...loop, draftPicks: loop.draftPicks ?? [] };
  const fixtures = seasonFixtures(session, game.season);
  return {
    game,
    world,
    day: tradeDay(world, game.season, game.date, playedTables(session, fixtures)),
    cal: tradeCalendar(session.config.competitions, game.season, fixtures),
    trade: { a: game.userCid, b: proposal.cid, aGives: proposal.give, bGives: proposal.get },
  };
}

/** What one side gives, in words. */
function assets(world: LoopWorld & TradeWorld, from: number, side: Trade["aGives"]): string {
  const parts = [
    ...side.pids.map((pid) => {
      const p = world.players.find((x) => x.pid === pid);
      return p ? fullName(p) : "?";
    }),
    ...side.picks.map((ref) => pickLabel(ref, world.clubs, from)),
  ];
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

/** Makes the (checked) trade and saves it; the words for the user. */
function makeTrade(session: LeagueSession, { game, world, trade }: TradeSetup): string {
  const club = world.clubs.find((c) => c.cid === trade.b);
  const youGet = assets(world, trade.b, trade.bGives);
  const theyGet = assets(world, trade.a, trade.aGives);
  const { changed, transaction } = applyTrade(world, game.season, game.date, trade);
  for (const p of world.players) if (changed.has(p.pid)) session.cache.put("players", p);
  savePicks(session, world);
  saveTransactions(session, [transaction]);
  return `Trade done with ${club?.name ?? "them"}: you get ${youGet}; they get ${theyGet}.`;
}

/**
 * Puts the trade to the other club. Refused if it breaks a rule (the reasons say which);
 * otherwise the club says yes when it gains by it, and the trade is made at once.
 */
export function proposeTrade(
  session: LeagueSession,
  proposal: TradeProposal,
): Promise<TradeAnswer> {
  return queued(session, async () => {
    assertNotLive(session);
    const s = setup(session, proposal);
    const { game, world, day, cal, trade } = s;
    const club = world.clubs.find((c) => c.cid === trade.b);
    const problems = tradeProblems(world, cal, game.date, trade);
    if (problems.length > 0) return { accepted: false, message: problems.join(" ") };
    if (!aiAccepts(tradeValueFor(world, day, trade, trade.b))) {
      return {
        accepted: false,
        message: `${club?.name ?? "They"} turn it down. Ask what would make it work.`,
      };
    }
    const message = makeTrade(session, s);
    await session.cache.flush();
    return { accepted: true, message };
  });
}

/**
 * Answers an AI club's trade offer in the inbox. Accepted while it stands, still valid by
 * the rules and still good for the club (values change: it may have changed its mind),
 * it's made at once. Either way the offer is answered.
 */
export function respondToTradeOffer(
  session: LeagueSession,
  mid: number,
  accept: boolean,
): Promise<TradeAnswer> {
  return queued(session, async () => {
    assertNotLive(session);
    const message = session.cache.get("inbox", mid);
    const offer = message?.tradeOffer;
    if (!message || !offer || offer.status !== "open") {
      throw new GameError("That offer isn't open.");
    }
    const game = meta<GameMeta>(session, "game");
    if (game.date > offer.expires) {
      return { accepted: false, message: `The offer stood until ${formatDay(offer.expires)}.` };
    }
    const answered = (status: "accepted" | "rejected") =>
      session.cache.put("inbox", { ...message, read: true, tradeOffer: { ...offer, status } });
    if (!accept) {
      answered("rejected");
      await session.cache.flush();
      return { accepted: false, message: "You turn the offer down." };
    }
    const s = setup(session, { cid: offer.cid, give: offer.give, get: offer.get });
    const problems = tradeProblems(s.world, s.cal, game.date, s.trade);
    if (problems.length > 0) return { accepted: false, message: problems.join(" ") };
    if (!aiAccepts(tradeValueFor(s.world, s.day, s.trade, s.trade.b))) {
      answered("rejected");
      await session.cache.flush();
      return { accepted: false, message: "They have changed their mind: the offer is off." };
    }
    const done = makeTrade(session, s);
    answered("accepted");
    await session.cache.flush();
    return { accepted: true, message: done };
  });
}

/**
 * The trading block (SPEC §17.6): what AI clubs would give for the players and picks the
 * user puts up. Each AI club that would take them adds the assets worth most to his club
 * while it still gains (`bestOffer`); the best `blockOffers` offers, best for him first.
 */
export function tradingBlock(session: LeagueSession, give: TradeAssets): TradeWork[] {
  const game = meta<GameMeta>(session, "game");
  const trades = session.config.competitions.trades;
  const others = session.cache.getAll("clubs").filter((c) => c.cid !== game.userCid);
  const first = others[0];
  if (!trades || !first)
    throw new GameError("Players move by transfers in this world, not trades.");
  if (give.pids.length + give.picks.length === 0) {
    throw new GameError("Put up at least one player or pick.");
  }
  // Trades open, and his side by the rules (each club's own limits come with its offer).
  const base = setup(session, { cid: first.cid, give, get: { pids: [], picks: [] } });
  const closed = tradesClosed(base.cal, game.date);
  if (closed) throw new GameError(closed);
  for (const pid of give.pids) {
    const p = base.world.players.find((x) => x.pid === pid);
    const why = untradablePlayer(p, game.userCid, base.cal, game.date);
    if (why) throw new GameError(`You can't trade ${why}.`);
  }
  for (const ref of give.picks) {
    const held = base.world.draftPicks.find(
      (p) => p.season === ref.season && p.round === ref.round && p.originalCid === ref.originalCid,
    );
    if (held?.cid !== game.userCid) {
      throw new GameError(`You don't hold that ${pickLabel(ref, base.world.clubs)}.`);
    }
  }
  const offers = others.flatMap((club) => {
    const trade: Trade = { ...base.trade, b: club.cid };
    if (!aiAccepts(tradeValueFor(base.world, base.day, trade, club.cid))) return [];
    if (tradeProblems(base.world, base.cal, game.date, trade).length > 0) return [];
    const offer = bestOffer(
      base.world,
      base.day,
      base.cal,
      trade,
      club.cid,
      trades.makeItWorkMaxAdded,
    );
    if (offer.bGives.pids.length + offer.bGives.picks.length === 0) return [];
    const value = tradeValueFor(base.world, base.day, offer, game.userCid).dv;
    return [{ club, offer, value }];
  });
  return offers
    .sort((a, b) => b.value - a.value || a.club.cid - b.club.cid)
    .slice(0, trades.ai.blockOffers)
    .map(({ club, offer }) => ({
      proposal: { cid: club.cid, give: offer.aGives, get: offer.bGives },
      message: `${club.name} offer ${assets(base.world, club.cid, offer.bGives)}.`,
    }));
}

/**
 * "What would make this work?": the trade the other club would take, adding what it would
 * want from the user's side (nothing if it would already), or null with why not.
 */
export function makeTradeWork(session: LeagueSession, proposal: TradeProposal): TradeWork {
  const { game, world, day, cal, trade } = setup(session, proposal);
  const club = world.clubs.find((c) => c.cid === trade.b);
  const name = club?.name ?? "They";
  const problems = tradeProblems(world, cal, game.date, trade);
  if (problems.length > 0) return { proposal: null, message: problems.join(" ") };
  const max = session.config.competitions.trades?.makeItWorkMaxAdded ?? 0;
  const worked = makeItWork(world, day, cal, trade, trade.b, max);
  if (!worked) {
    return { proposal: null, message: `${name} can't find anything of yours that would do.` };
  }
  const added = {
    pids: worked.aGives.pids.filter((pid) => !trade.aGives.pids.includes(pid)),
    picks: worked.aGives.picks.filter(
      (p) =>
        !trade.aGives.picks.some(
          (q) => q.season === p.season && q.round === p.round && q.originalCid === p.originalCid,
        ),
    ),
  };
  const message =
    added.pids.length + added.picks.length === 0
      ? `${name} would take it as it is.`
      : `${name} would do it if you add ${assets(world, trade.a, added)}.`;
  return {
    proposal: { cid: trade.b, give: worked.aGives, get: worked.bGives },
    message,
  };
}
