/**
 * AI-to-AI trades (SPEC §17.6): on trade days while trades are open, a few AI clubs each
 * go after a player another AI club values less than they do (a rebuilding club's veteran
 * for a contender, a contender's prospect for a rebuilding club), and ask the owner what
 * would make it work. The trade goes ahead when both clubs gain and neither is left short
 * in an area of the pitch, and a player got by trade stays a while before he's traded on.
 * Clubs over their cap outside a grace season shed wages first (SPEC §17.7).
 * The user's club isn't part of them: AI clubs make him offers instead (`aiOfferToUser`).
 */
import type { TradesConfig } from "../../common/config/competitions";
import { addDays, formatDay } from "../../common/dates";
import type { Player } from "../../common/schema";
import { Random } from "../core/random";
import { AREA, emptyLog, fullName, type LoopWorld, type TurnoverLog } from "../season/offseason";
import type { NewMessage } from "../season/runner";
import {
  aiAccepts,
  applyTrade,
  makeItWork,
  noAssets,
  pickLabel,
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
  for (const view of shedding) {
    // Up to `perDay` trades a club, while it still must shed.
    for (let n = 0; n < trades.ai.shed.perDay; n++) {
      if (!(views.get(view.cid) as ClubView).mustShed || !shedWages(view.cid)) break;
    }
  }
  /** One wage-shedding trade for club `cid`, if it can make one. */
  function shedWages(cid: number): boolean {
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
      if (tried === (trades?.ai.shed.candidates ?? 0)) return false;
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
        if (worked && make(worked)) return true;
      }
    }
    return false;
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

/**
 * An AI club's trade offer to the user on a trade day (SPEC §17.6): with `offers.chance`,
 * an AI club offers for one of his players what an AI club in his place would take ("What
 * would make this work?" for his club), if it gains by it too: of the `shortlist` players
 * AI clubs are keenest on (what he'd add where he'd stand in their squads, against what he
 * adds to the user's), each with its keenest club, the first in random order that makes
 * such an offer. It goes to his
 * inbox and stands `offers.standDays`, to the roster deadline at most; at most
 * `offers.maxOpen` stand at once.
 */
export function aiOfferToUser(
  world: LoopWorld,
  season: number,
  date: string,
  cal: TradeCalendar,
  tables?: Readonly<Record<string, readonly number[]>>,
): NewMessage[] {
  const trades = world.config.competitions.trades;
  const user = world.clubs.find((c) => c.cid === world.userCid);
  if (!trades || !user || world.config.switches.market !== "trades") return [];
  if (tradesClosed(cal, date) || (world.openTradeOffers ?? 0) >= trades.ai.offers.maxOpen) {
    return [];
  }
  const rng = Random.fromSeed(`${world.seed}/offers/${date}`);
  if (!rng.bool(trades.ai.offers.chance)) return [];
  const tw: LoopWorld & TradeWorld = { ...world, draftPicks: world.draftPicks ?? [] };
  const day = tradeDay(tw, season, date, tables);
  const value = (p: Player, view: ClubView) => cachedValue(trades, p, view, day);
  const mine = clubView(tw, user.cid, day);
  const since = addDays(date, -trades.ai.keepAcquiredDays);
  const settled = (p: Player) => {
    const last = p.transfers.at(-1);
    return !last || last.type !== "trade" || last.date <= since;
  };
  // Not a player asked for lately (an offer isn't made again within `repeatAfterDays`).
  const lately = addDays(date, -trades.ai.offers.repeatAfterDays);
  const asked = new Set((world.offeredFor ?? []).filter((o) => o.date > lately).map((o) => o.pid));
  const squad = world.players.filter(
    (p) =>
      p.cid === user.cid &&
      p.status === "club" &&
      !asked.has(p.pid) &&
      untradablePlayer(p, user.cid, cal, date) === null,
  );
  // How much a player adds to a squad where he'd stand (its values, best first): his value
  // times his place's weight (`squadWeights`), so a club only wants him if he'd play.
  const weightAt = (place: number) => trades.squadWeights.find(([upTo]) => place <= upTo)?.[1] ?? 0;
  const adds = (v: number, squadValues: readonly number[]) =>
    v * weightAt(1 + squadValues.filter((x) => x > v).length);
  const valuesOf = (cid: number, view: ClubView) =>
    world.players
      .filter((q) => q.cid === cid && q.status === "club")
      .map((q) => value(q, view))
      .sort((a, b) => b - a);
  const mineNow = valuesOf(user.cid, mine);
  const others = world.clubs
    .filter((c) => c.cid !== user.cid)
    .map((c) => {
      const view = clubView(tw, c.cid, day);
      return { view, values: valuesOf(c.cid, view) };
    });
  // Each of his players' keenest AI club, by what he'd add there against what he adds to
  // his club; the players clubs are keenest on first.
  const pairs = squad
    .map((p) => {
      const own = value(p, mine);
      const loss = own * weightAt(1 + mineNow.filter((x) => x > own).length);
      let best = { cid: -1, gain: -Infinity };
      for (const { view, values } of others) {
        const gain = adds(value(p, view), values) - loss;
        if (gain > best.gain) best = { cid: view.cid, gain };
      }
      return { ...best, p };
    })
    .filter((x) => x.gain > trades.ai.minGain)
    .sort((a, b) => b.gain - a.gain || a.p.pid - b.p.pid)
    .slice(0, trades.ai.shortlist);
  /** The trade with the one asset of `cid`'s that costs it least, still good for both. */
  function cheapestAddition(trade: Trade, cid: number): Trade | null {
    const side = trade.aGives;
    const options: Trade[] = [
      ...world.players
        .filter((q) => q.cid === cid && q.status === "club" && settled(q))
        .map((q) => ({ ...trade, aGives: { ...side, pids: [...side.pids, q.pid] } })),
      ...tw.draftPicks
        .filter((q) => q.cid === cid)
        .map((q) => ({
          ...trade,
          aGives: {
            ...side,
            picks: [
              ...side.picks,
              { season: q.season, round: q.round, originalCid: q.originalCid },
            ],
          },
        })),
    ];
    let best: { trade: Trade; dv: number } | null = null;
    for (const option of options) {
      const dv = tradeValueFor(tw, day, option, cid).dv;
      if (dv <= 0 || (best && dv <= best.dv)) continue;
      if (!aiAccepts(tradeValueFor(tw, day, option, user?.cid ?? -1))) continue;
      if (tradeProblems(tw, cal, date, option).length > 0) continue;
      best = { trade: option, dv };
    }
    return best?.trade ?? null;
  }
  // In random order, the first that makes an offer both clubs would take.
  let found: { cid: number; p: Player; offer: Trade } | null = null;
  for (const { cid, p } of rng.shuffle(pairs)) {
    const ask: Trade = {
      a: cid,
      b: user.cid,
      aGives: noAssets(),
      bGives: { pids: [p.pid], picks: [] },
    };
    const worked = makeItWork(tw, day, cal, ask, user.cid, trades.makeItWorkMaxAdded, settled);
    // An offer gives him something: if he'd let the player go for nothing, the club adds
    // what costs it least.
    const offer =
      worked && worked.aGives.pids.length + worked.aGives.picks.length === 0
        ? cheapestAddition(worked, cid)
        : worked;
    if (!offer || !aiAccepts(tradeValueFor(tw, day, offer, cid))) continue;
    if (tradeProblems(tw, cal, date, offer).length > 0) continue;
    if (!keepsShapeOf(tw, cid, offer.aGives.pids, offer.bGives.pids, trades.ai.minByArea)) continue;
    found = { cid, p, offer };
    break;
  }
  if (!found) return [];
  const { cid, p, offer } = found;
  const deadline = cal.deadline ?? `${season + 1}-06-30`;
  const standsTo = addDays(date, trades.ai.offers.standDays);
  const expires = standsTo < deadline ? standsTo : deadline;
  world.openTradeOffers = (world.openTradeOffers ?? 0) + 1;
  (world.offeredFor ??= []).push(...offer.bGives.pids.map((pid) => ({ pid, date })));
  const club = world.clubs.find((c) => c.cid === cid);
  const named = (pids: readonly number[]) =>
    pids.flatMap((pid) => {
      const q = world.players.find((x) => x.pid === pid);
      return q ? [{ pid, name: fullName(q) }] : [];
    });
  const words = (from: number, side: Trade["aGives"]) =>
    [
      ...named(side.pids).map((x) => x.name),
      ...side.picks.map((ref) => pickLabel(ref, world.clubs, from)),
    ].join(", ");
  return [
    {
      date,
      season,
      kind: "trade",
      subject: `${club?.name ?? "A club"} offer a trade for ${fullName(p)}`,
      body: `${club?.name ?? "They"} offer ${words(cid, offer.aGives)} for ${words(user.cid, offer.bGives)}. The offer stands until ${formatDay(expires)}.`,
      read: false,
      players: named([...offer.bGives.pids, ...offer.aGives.pids]),
      tradeOffer: { cid, give: offer.bGives, get: offer.aGives, expires, status: "open" },
    },
  ];
}
