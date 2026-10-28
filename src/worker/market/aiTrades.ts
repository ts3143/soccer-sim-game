/**
 * AI-to-AI trades (SPEC §17.6): on trade days while trades are open, a few AI clubs each
 * go after a player another AI club values less than they do (a rebuilding club's veteran
 * for a contender, a contender's prospect for a rebuilding club), and ask the owner what
 * would make it work. The trade goes ahead when both clubs gain and neither is left short
 * in an area of the pitch, and a player got by trade stays a while before he's traded on.
 * Clubs over their cap outside a grace season shed wages first (SPEC §17.7).
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
import { payroll } from "../finance/softCap";
import {
  cachedValue,
  type ClubView,
  clubView,
  tradeDay,
  type TradeWorld,
  valueChange,
} from "./tradeValue";

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
const MIN_NONE: Record<Area, number> = { gk: 0, def: 0, mid: 0, att: 0 };

/**
 * A club losing `out` and getting `gets` doesn't end below its area minimums (unless it
 * already was, and isn't worse).
 */
function keepsShapeOf(
  world: TradeWorld,
  cid: number,
  out: readonly number[],
  gets: readonly number[],
  min: Record<Area, number>,
): boolean {
  const leaving = new Set(out);
  const incoming = new Set(gets);
  const before = { gk: 0, def: 0, mid: 0, att: 0 };
  const after = { gk: 0, def: 0, mid: 0, att: 0 };
  for (const p of world.players) {
    if (incoming.has(p.pid)) after[AREA[p.position]]++;
    if (p.cid !== cid || p.status !== "club") continue;
    before[AREA[p.position]]++;
    if (!leaving.has(p.pid)) after[AREA[p.position]]++;
  }
  return (["gk", "def", "mid", "att"] as const).every(
    (area) => after[area] >= min[area] || after[area] >= before[area],
  );
}

/** Neither club ends below its area minimums, unless it was already (and isn't worse). */
const keepsShape = (world: TradeWorld, trade: Trade, min: Record<Area, number>): boolean =>
  keepsShapeOf(world, trade.a, trade.aGives.pids, trade.bGives.pids, min) &&
  keepsShapeOf(world, trade.b, trade.bGives.pids, trade.aGives.pids, min);

/**
 * One trade day. First every AI club that must shed wages (over its cap outside a grace
 * season, SPEC §17.7) offers its players of least value a euro, one by one (those it would
 * let go for nothing without being left short in an area), to the clubs with room under
 * their line for his wage that value him most; the receiver may ask for its picks to make
 * it work. One such trade a club a day. Then up to `attemptsPerDay` trades
 * as described above. `tables` as `projectedSlots`. Returns the moved players and the
 * transactions; picks change owners in place.
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
  const views = new Map<number, ClubView>(clubs.map((c) => [c.cid, clubView(tw, c.cid, day)]));
  const value = (p: Player, view: ClubView) => cachedValue(trades, p, view, day);
  // A player an AI club got by trade stays a while before it trades him on.
  const since = addDays(date, -trades.ai.keepAcquiredDays);
  const settled = (p: Player) => {
    const last = p.transfers.at(-1);
    return !last || last.type !== "trade" || last.date <= since;
  };
  const make = (trade: Trade): boolean => {
    if (!aiAccepts(tradeValueFor(tw, day, trade, trade.a))) return false;
    if (!aiAccepts(tradeValueFor(tw, day, trade, trade.b))) return false;
    if (tradeProblems(tw, cal, date, trade).length > 0) return false;
    if (!keepsShape(tw, trade, trades.ai.minByArea)) return false;
    const { changed, transaction } = applyTrade(world, season, date, trade);
    for (const pid of changed) log.changed.add(pid);
    log.transactions.push(transaction);
    for (const cid of [trade.a, trade.b]) views.set(cid, clubView(tw, cid, day));
    return true;
  };

  // Relegated clubs past their grace first: they must be under their own cap at the close.
  const shedding = rng
    .shuffle(clubs)
    .map((c) => views.get(c.cid) as ClubView)
    .filter((v) => v.mustShed)
    .sort((a, b) => Number(b.relegated) - Number(a.relegated));
  for (const view of shedding) shedWages(view.cid);
  function shedWages(cid: number) {
    const view = views.get(cid) as ClubView;
    const offers = world.players
      .filter(
        (p) =>
          p.cid === cid &&
          p.status === "club" &&
          (p.contract?.wage ?? 0) > 0 &&
          settled(p) &&
          untradablePlayer(p, cid, cal, date) === null,
      )
      .map((p) => ({ p, perEuro: value(p, view) / (p.contract?.wage ?? 1) }))
      .sort((a, b) => a.perEuro - b.perEuro || a.p.pid - b.p.pid);
    let tried = 0;
    for (const { p } of offers) {
      if (tried === (trades?.ai.shed.candidates ?? 0)) return;
      // Only players it would let go for nothing (picks would only cost it more), and
      // without leaving it short in an area.
      const alone = { pids: [p.pid], picks: [] };
      if (!keepsShapeOf(tw, cid, alone.pids, [], trades?.ai.minByArea ?? MIN_NONE)) continue;
      if (!aiAccepts(valueChange(tw, day, cid, alone, noAssets()))) continue;
      tried++;
      const wage = p.contract?.wage ?? 0;
      // Clubs with room under their line that could take him by the rules (the squad limit).
      const receivers = clubs
        .filter((c) => {
          const v = views.get(c.cid) as ClubView;
          return (
            c.cid !== cid &&
            v.line !== null &&
            payroll(c, world.players, date) + wage <= v.line &&
            tradeProblems(tw, cal, date, { a: cid, b: c.cid, aGives: alone, bGives: noAssets() })
              .length === 0
          );
        })
        .map((c) => ({ cid: c.cid, v: value(p, views.get(c.cid) as ClubView) }))
        .sort((a, b) => b.v - a.v || a.cid - b.cid)
        .slice(0, trades?.ai.shed.receivers ?? 0);
      for (const receiver of receivers) {
        const offer: Trade = {
          a: cid,
          b: receiver.cid,
          aGives: { pids: [p.pid], picks: [] },
          bGives: noAssets(),
        };
        // The receiver may ask for picks (not players: they'd be wages back).
        const max = trades?.makeItWorkMaxAdded ?? 0;
        const worked = makeItWork(tw, day, cal, offer, receiver.cid, max, () => false);
        if (worked && make(worked)) return;
      }
    }
  }

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
    if (worked) make(worked);
  }
  return log;
}
