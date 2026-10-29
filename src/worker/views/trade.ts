/**
 * The Trade page and the Trading Block (SPEC §17.6, §17.8): both clubs' squads and picks,
 * what the trade as it stands does to their payrolls and squads and which rules it breaks;
 * and the best offers for what the user puts up on the block.
 */
import type {
  TradeAssets,
  TradePlayerView,
  TradeProposal,
  TradeSideView,
  TradeView,
  TradingBlockView,
} from "../../common/api";
import { exactAge } from "../../common/dates";
import { GameError } from "../../common/errors";
import type { GameMeta } from "../../common/schema";
import { clubCap, payroll } from "../finance/softCap";
import { tradingBlock } from "../league/trade";
import type { LeagueSession } from "../league/session";
import {
  noAssets,
  type TradeCalendar,
  tradeCalendar,
  tradeProblems,
  tradesClosed,
  untradablePlayer,
} from "../market/trades";
import { fullName } from "../season/offseason";
import { isInjured } from "../season/squads";
import { seasonFixtures, teamRef } from "./common";
import { heldPicks } from "./draft";

const pickKey = (p: TradeAssets["picks"][number]) => `${p.season}/${p.round}/${p.originalCid}`;

/** What the Trade page and the block read: the day, the calendar, the clubs' picks. */
function context(session: LeagueSession) {
  if (session.config.switches.market !== "trades") {
    throw new GameError("Players move by transfers in this world, not trades.");
  }
  const game = session.cache.get("meta", "game") as GameMeta;
  const cal = tradeCalendar(
    session.config.competitions,
    game.season,
    seasonFixtures(session, game.season),
  );
  return { game, cal, picksOf: heldPicks(session) };
}

/** Club `cid`'s squad players, the best first, as the Trade page shows them. */
function tradePlayers(
  session: LeagueSession,
  cid: number,
  cal: TradeCalendar,
  date: string,
): TradePlayerView[] {
  return session.cache
    .getAll("players")
    .filter((p) => p.cid === cid && p.status === "club")
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .map((p) => ({
      pid: p.pid,
      name: fullName(p),
      nationality: p.nationality,
      position: p.position,
      age: Math.floor(exactAge(p.birthDate, date)),
      ovr: p.ovr,
      pot: p.pot,
      wage: p.contract?.wage ?? 0,
      expires: p.contract?.expires ?? "",
      injured: isInjured(p, date),
      untradable: untradablePlayer(p, cid, cal, date),
    }));
}

/** One club's side: what it holds, and its payroll and squad once it gives and gets. */
function side(
  session: LeagueSession,
  { game, cal, picksOf }: ReturnType<typeof context>,
  cid: number,
  gives: TradeAssets,
  gets: TradeAssets,
): TradeSideView {
  const club = session.cache.get("clubs", cid);
  if (!club) throw new GameError(`There's no club ${cid} in this game.`);
  const players = tradePlayers(session, cid, cal, game.date);
  const wage = new Map(session.cache.getAll("players").map((p) => [p.pid, p.contract?.wage ?? 0]));
  const wages = (pids: readonly number[]) => pids.reduce((s, pid) => s + (wage.get(pid) ?? 0), 0);
  const now = payroll(club, session.cache.getAll("players"), game.date);
  return {
    club: teamRef(club),
    players,
    picks: picksOf(cid),
    payroll: now,
    payrollAfter: now - wages(gives.pids) + wages(gets.pids),
    cap: clubCap(session.config.competitions, club, game.season),
    squad: players.length,
    squadAfter: players.length - gives.pids.length + gets.pids.length,
  };
}

/** What of `assets` club `cid` still holds (the rest is dropped). */
function stillHeld(session: LeagueSession, cid: number, assets: TradeAssets): TradeAssets {
  const held = new Set(
    session.cache
      .getAll("draftPicks")
      .filter((p) => p.cid === cid)
      .map(pickKey),
  );
  return {
    pids: assets.pids.filter((pid) => {
      const p = session.cache.get("players", pid);
      return p?.cid === cid && p.status === "club";
    }),
    picks: assets.picks.filter((p) => held.has(pickKey(p))),
  };
}

export function tradeView(session: LeagueSession, proposal: TradeProposal): TradeView {
  const ctx = context(session);
  const { game, cal } = ctx;
  if (proposal.cid === game.userCid) throw new GameError("Pick another club to trade with.");
  const give = stillHeld(session, game.userCid, proposal.give);
  const get = stillHeld(session, proposal.cid, proposal.get);
  const user = side(session, ctx, game.userCid, give, get);
  const other = side(session, ctx, proposal.cid, get, give);
  const closed = tradesClosed(cal, game.date);
  const proposed = give.pids.length + give.picks.length + get.pids.length + get.picks.length > 0;
  const world = {
    config: session.config,
    clubs: session.cache.getAll("clubs"),
    players: session.cache.getAll("players"),
    draftPicks: session.cache.getAll("draftPicks"),
  };
  const trade = { a: game.userCid, b: proposal.cid, aGives: give, bGives: get };
  return {
    proposal: { cid: proposal.cid, give, get },
    user,
    other,
    closed,
    problems: proposed
      ? tradeProblems(world, cal, game.date, trade).filter((p) => p !== closed)
      : [],
  };
}

export function tradingBlockView(session: LeagueSession, give: TradeAssets): TradingBlockView {
  const ctx = context(session);
  const { game, cal, picksOf } = ctx;
  const put = stillHeld(session, game.userCid, give);
  const closed = tradesClosed(cal, game.date);
  const offers =
    closed || put.pids.length + put.picks.length === 0 ? [] : tradingBlock(session, put);
  return {
    user: side(session, ctx, game.userCid, noAssets(), noAssets()),
    closed,
    offers: offers.flatMap(({ proposal }) => {
      if (!proposal) return [];
      const club = session.cache.get("clubs", proposal.cid);
      const getting = new Set(proposal.get.picks.map(pickKey));
      return [
        {
          proposal,
          club: teamRef(club),
          players: tradePlayers(session, proposal.cid, cal, game.date).filter((p) =>
            proposal.get.pids.includes(p.pid),
          ),
          picks: picksOf(proposal.cid).filter((p) =>
            getting.has(
              pickKey({
                season: p.season,
                round: p.round,
                originalCid: p.from?.cid ?? proposal.cid,
              }),
            ),
          ),
        },
      ];
    }),
  };
}
