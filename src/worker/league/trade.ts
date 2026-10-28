/**
 * The user's trades (SPEC §17.6): he puts a trade to an AI club, which says yes when it
 * raises its value, and can ask it what would make a trade work. The Trade page is SL7's.
 */
import type { TradeAnswer, TradeProposal, TradeWork } from "../../common/api";
import { GameError } from "../../common/errors";
import type { GameMeta } from "../../common/schema";
import {
  aiAccepts,
  applyTrade,
  makeItWork,
  pickLabel,
  type Trade,
  tradeCalendar,
  tradeProblems,
  tradeValueFor,
} from "../market/trades";
import { type TradeDay, tradeDay, type TradeWorld } from "../market/tradeValue";
import { fullName, type LoopWorld } from "../season/offseason";
import { leagueTables, seasonFixtures } from "../views/common";
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
  // The tables once a league match is played; before that, squad strength (projectedSlots).
  const leagues = new Set(session.config.competitions.leagues.map((l) => l.id));
  const started = fixtures.some((f) => f.result && leagues.has(f.competition));
  const tables = started
    ? Object.fromEntries(
        leagueTables(session, fixtures).map((t) => [t.id, t.rows.map((r) => r.cid)]),
      )
    : undefined;
  return {
    game,
    world,
    day: tradeDay(world, game.season, game.date, tables),
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
    const { game, world, day, cal, trade } = setup(session, proposal);
    const club = world.clubs.find((c) => c.cid === trade.b);
    const problems = tradeProblems(world, cal, game.date, trade);
    if (problems.length > 0) return { accepted: false, message: problems.join(" ") };
    if (!aiAccepts(tradeValueFor(world, day, trade, trade.b))) {
      return {
        accepted: false,
        message: `${club?.name ?? "They"} turn it down. Ask what would make it work.`,
      };
    }
    const youGet = assets(world, trade.b, trade.bGives);
    const theyGet = assets(world, trade.a, trade.aGives);
    const { changed, transaction } = applyTrade(world, game.season, game.date, trade);
    for (const p of world.players) if (changed.has(p.pid)) session.cache.put("players", p);
    savePicks(session, world);
    saveTransactions(session, [transaction]);
    await session.cache.flush();
    return {
      accepted: true,
      message: `Trade done with ${club?.name ?? "them"}: you get ${youGet}; they get ${theyGet}.`,
    };
  });
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
