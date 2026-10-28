/**
 * AI-to-AI trades (SPEC §17.6): on trade days while trades are open, a few AI clubs each
 * go after a player another AI club values less than they do (a rebuilding club's veteran
 * for a contender, a contender's prospect for a rebuilding club), and ask the owner what
 * would make it work. The trade goes ahead when both clubs gain and neither is left short
 * in an area of the pitch, and a player got by trade stays a while before he's traded on.
 * The user's club isn't part of them (its offers come later).
 */
import type { TradesConfig } from "../../common/config/competitions";
import { addDays } from "../../common/dates";
import type { Player } from "../../common/schema";
import { Random } from "../core/random";
import { AREA, emptyLog, type LoopWorld, type TurnoverLog } from "../season/offseason";
import {
  aiAccepts,
  applyTrade,
  makeItWork,
  noAssets,
  type Trade,
  type TradeCalendar,
  tradeProblems,
  tradesClosed,
  tradeValueFor,
  untradablePlayer,
} from "./trades";
import { type ClubView, clubView, playerTradeValue, tradeDay, type TradeWorld } from "./tradeValue";

/** The AI's trade days of a season: every `everyDays` from 1 July to the roster deadline. */
export function tradeDays(trades: TradesConfig | null, cal: TradeCalendar): string[] {
  if (!trades) return [];
  const end = cal.deadline ?? `${cal.season + 1}-06-30`;
  const days: string[] = [];
  for (let d = addDays(`${cal.season}-07-01`, trades.ai.everyDays); d <= end;) {
    days.push(d);
    d = addDays(d, trades.ai.everyDays);
  }
  return days;
}

type Area = (typeof AREA)[keyof typeof AREA];

/** Neither club ends below its area minimums, unless it was already (and isn't worse). */
function keepsShape(world: TradeWorld, trade: Trade, min: Record<Area, number>): boolean {
  const moving = new Set([...trade.aGives.pids, ...trade.bGives.pids]);
  for (const [cid, gets] of [
    [trade.a, trade.bGives.pids],
    [trade.b, trade.aGives.pids],
  ] as const) {
    const before = { gk: 0, def: 0, mid: 0, att: 0 };
    const after = { gk: 0, def: 0, mid: 0, att: 0 };
    for (const p of world.players) {
      if (p.cid !== cid || p.status !== "club") continue;
      before[AREA[p.position]]++;
      if (!moving.has(p.pid)) after[AREA[p.position]]++;
    }
    const incoming = new Set(gets);
    for (const p of world.players) if (incoming.has(p.pid)) after[AREA[p.position]]++;
    for (const area of ["gk", "def", "mid", "att"] as const) {
      if (after[area] < min[area] && after[area] < before[area]) return false;
    }
  }
  return true;
}

/**
 * One trade day: up to `attemptsPerDay` AI-to-AI trades. `tables` as `projectedSlots`.
 * Returns the moved players and the transactions; picks change owners in place.
 */
export function aiTradeDay(
  world: LoopWorld,
  season: number,
  date: string,
  cal: TradeCalendar,
  tables?: Readonly<Record<string, readonly number[]>>,
): TurnoverLog {
  const log = emptyLog();
  const trades = world.config.competitions.trades;
  if (!trades || world.config.switches.market !== "trades" || tradesClosed(cal, date)) return log;
  const tw: LoopWorld & TradeWorld = { ...world, draftPicks: world.draftPicks ?? [] };
  const day = tradeDay(tw, season, date, tables);
  const rng = Random.fromSeed(`${world.seed}/trades/${date}`);
  const clubs = world.clubs.filter((c) => c.cid !== world.userCid);
  const views = new Map<number, ClubView>(clubs.map((c) => [c.cid, clubView(tw, c.cid, season)]));
  const value = (p: Player, view: ClubView) => playerTradeValue(trades, p, view, day);
  // A player an AI club got by trade stays a while before it trades him on.
  const since = addDays(date, -trades.ai.keepAcquiredDays);
  const settled = (p: Player) => {
    const last = p.transfers.at(-1);
    return !last || last.type !== "trade" || last.date <= since;
  };

  for (let attempt = 0; attempt < trades.ai.attemptsPerDay; attempt++) {
    const club = rng.choice(clubs);
    const mine = views.get(club.cid) as ClubView;
    const shortlist = world.players
      .filter(
        (p) =>
          p.status === "club" &&
          p.cid !== null &&
          p.cid !== club.cid &&
          views.has(p.cid) &&
          settled(p) &&
          untradablePlayer(p, p.cid, cal, date) === null,
      )
      .map((p) => ({ p, gain: value(p, mine) - value(p, views.get(p.cid as number) as ClubView) }))
      .filter((x) => x.gain > trades.ai.minGain)
      .sort((a, b) => b.gain - a.gain || a.p.pid - b.p.pid)
      .slice(0, trades.ai.shortlist);
    if (shortlist.length === 0) continue;
    const target = rng.choice(shortlist).p;
    const owner = target.cid as number;
    const ask: Trade = {
      a: club.cid,
      b: owner,
      aGives: noAssets(),
      bGives: { pids: [target.pid], picks: [] },
    };
    const worked = makeItWork(tw, day, cal, ask, owner, trades.makeItWorkMaxAdded, settled);
    if (!worked || !aiAccepts(tradeValueFor(tw, day, worked, club.cid))) continue;
    if (tradeProblems(tw, cal, date, worked).length > 0) continue;
    if (!keepsShape(tw, worked, trades.ai.minByArea)) continue;
    const { changed, transaction } = applyTrade(world, season, date, worked);
    for (const pid of changed) log.changed.add(pid);
    log.transactions.push(transaction);
  }
  return log;
}
