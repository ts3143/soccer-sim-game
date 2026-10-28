/**
 * Trades (SPEC §17.6; the Super League's player market): players and draft picks between
 * two clubs, no cash. When they're open (from 1 July to the roster deadline, and again
 * from the end of the play-offs), what can't be traded (final-year players once the
 * season is over; prospects, free agents), the squad limit while it counts, and salary
 * matching for a club over its cap. The trade itself moves players and picks. An AI club
 * says yes when the trade raises its value (tradeValue.ts); "What would make this work?"
 * asks it what it would want added from the other side.
 */
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { Club, Fixture, Player } from "../../common/schema";
import { clubCap, payroll, tradeFits } from "../finance/softCap";
import { firstLeagueDay, rosterDeadline } from "../season/freeAgency";
import {
  freeShirtNumber,
  fullName,
  type LoopWorld,
  type NewTransaction,
} from "../season/offseason";
import {
  type PickRef,
  type TradeDay,
  type TradeSide,
  type TradeWorld,
  type ValueChange,
  valueChange,
} from "./tradeValue";

/** A season's dates that open and close trades. */
export interface TradeCalendar {
  season: number;
  /** The roster deadline (null: none). */
  deadline: string | null;
  /** The first league match: the squad limit counts from it. */
  firstMatch: string | null;
  /** The season's last match (the end of the play-offs). */
  seasonEnd: string | null;
}

/** Two clubs and what each gives. */
export interface Trade {
  a: number;
  b: number;
  aGives: TradeSide;
  bGives: TradeSide;
}

export const noAssets = (): TradeSide => ({ pids: [], picks: [] });

const keyOf = (p: PickRef) => `${p.season}/${p.round}/${p.originalCid}`;

export function tradeCalendar(
  config: CompetitionsConfig,
  season: number,
  fixtures: readonly Fixture[],
): TradeCalendar {
  const own = fixtures.filter((f) => f.season === season);
  let seasonEnd: string | null = null;
  for (const f of own) if (seasonEnd === null || f.date > seasonEnd) seasonEnd = f.date;
  return {
    season,
    deadline: rosterDeadline(config, own),
    firstMatch: firstLeagueDay(config, own),
    seasonEnd,
  };
}

/** The season is over on `date`: its last match has been played. */
const seasonOver = (cal: TradeCalendar, date: string) =>
  cal.seasonEnd !== null && date > cal.seasonEnd;

/**
 * Why trades are closed on `date`, or null when they're open: from 1 July to the roster
 * deadline (both included), then again from the day after the season's last match.
 */
export function tradesClosed(cal: TradeCalendar, date: string): string | null {
  if (seasonOver(cal, date)) return null;
  if (date >= `${cal.season}-07-01` && (cal.deadline === null || date <= cal.deadline)) return null;
  return "Trades are closed from the roster deadline until the end of the play-offs.";
}

/** The squad limit counts on `date` (from the first league match to the season's end). */
function limitCounts(config: CompetitionsConfig, cal: TradeCalendar, date: string): boolean {
  if (!config.rosterRules.maxSeniorFromFirstMatch) return true;
  return cal.firstMatch !== null && date >= cal.firstMatch && !seasonOver(cal, date);
}

/** A player is in his final year once his contract ends this coming 30 June. */
const finalYear = (p: Player, season: number) => p.contract?.expires === `${season + 1}-06-30`;

/** Why a player can't be traded by `cid` now, or null. */
export function untradablePlayer(
  p: Player | undefined,
  cid: number,
  cal: TradeCalendar,
  date: string,
): string | null {
  if (!p || p.cid !== cid || p.status !== "club") return "a player not in its squad";
  if (seasonOver(cal, date) && finalYear(p, cal.season)) {
    return `${fullName(p)}, whose contract ends on 30 June`;
  }
  return null;
}

/**
 * What's wrong with a trade on `date` (empty: it can go ahead). Both clubs must exist and
 * differ; each gives only its own tradable players and picks; something must change hands;
 * while the squad limit counts neither club ends above it; a club over its cap afterwards
 * takes back at most the configured share of the wages it sends.
 */
export function tradeProblems(
  world: TradeWorld,
  cal: TradeCalendar,
  date: string,
  trade: Trade,
): string[] {
  const competitions = world.config.competitions;
  const problems: string[] = [];
  const closed = tradesClosed(cal, date);
  if (closed) problems.push(closed);
  const clubA = world.clubs.find((c) => c.cid === trade.a);
  const clubB = world.clubs.find((c) => c.cid === trade.b);
  if (!clubA || !clubB || trade.a === trade.b) return [...problems, "A trade needs two clubs."];
  const assets = [...trade.aGives.pids, ...trade.bGives.pids].length;
  if (assets + trade.aGives.picks.length + trade.bGives.picks.length === 0) {
    problems.push("Nothing changes hands.");
  }
  const byPid = new Map(world.players.map((p) => [p.pid, p]));
  const picks = new Map(world.draftPicks.map((p) => [keyOf(p), p]));
  const sides = [
    { club: clubA, gives: trade.aGives, gets: trade.bGives },
    { club: clubB, gives: trade.bGives, gets: trade.aGives },
  ];
  for (const { club, gives } of sides) {
    if (new Set(gives.pids).size !== gives.pids.length) problems.push("A player is in twice.");
    for (const pid of gives.pids) {
      const why = untradablePlayer(byPid.get(pid), club.cid, cal, date);
      if (why) problems.push(`${club.name} can't trade ${why}.`);
    }
    if (new Set(gives.picks.map(keyOf)).size !== gives.picks.length) {
      problems.push("A pick is in twice.");
    }
    for (const ref of gives.picks) {
      if (picks.get(keyOf(ref))?.cid !== club.cid) {
        problems.push(`${club.name} doesn't hold that ${pickLabel(ref, world.clubs)}.`);
      }
    }
  }
  if (problems.length > 0) return problems;

  const wages = (pids: readonly number[]) =>
    pids.reduce((s, pid) => s + (byPid.get(pid)?.contract?.wage ?? 0), 0);
  const max = competitions.rosterRules.maxSenior;
  for (const { club, gives, gets } of sides) {
    const squad = world.players.filter((p) => p.cid === club.cid && p.status === "club").length;
    const after = squad - gives.pids.length + gets.pids.length;
    if (after > max && after > squad && limitCounts(competitions, cal, date)) {
      problems.push(`${club.name} would have ${after} players, over the limit of ${max}.`);
    }
    const cap = clubCap(competitions, club, cal.season);
    if (competitions.softCap && cap !== null) {
      const now = payroll(club, world.players, date);
      if (!tradeFits(competitions.softCap, now, cap, wages(gives.pids), wages(gets.pids))) {
        const share = Math.round(competitions.softCap.tradeMatching * 100);
        problems.push(
          `${club.name} would end over the cap: over it, a club takes back at most ${share}% of the wages it sends.`,
        );
      }
    }
  }
  return problems;
}

/** "the 2027 round 1 pick", with its original club's name when given. */
export function pickLabel(ref: PickRef, clubs: readonly Club[], holder?: number): string {
  const label = `${ref.season + 1} round ${ref.round} pick`;
  if (holder === ref.originalCid) return label;
  const from = clubs.find((c) => c.cid === ref.originalCid);
  return from ? `${label} (${from.name}'s)` : label;
}

/**
 * Makes a trade (checked first by `tradeProblems`): players change clubs with their
 * contracts and get a free shirt number; picks change owners. Returns the changed players
 * and the transaction.
 */
export function applyTrade(
  world: LoopWorld,
  season: number,
  date: string,
  trade: Trade,
): { changed: Set<number>; transaction: NewTransaction } {
  const changed = new Set<number>();
  const clubOf = (cid: number) => world.clubs.find((c) => c.cid === cid) as Club;
  const describe = (from: number, gives: TradeSide) => {
    const parts: string[] = [];
    for (const pid of gives.pids) {
      const p = world.players.find((x) => x.pid === pid);
      if (p) parts.push(fullName(p));
    }
    for (const ref of gives.picks) parts.push(pickLabel(ref, world.clubs, from));
    return parts.length > 0 ? parts.join(", ") : "nothing";
  };
  const names = [
    clubOf(trade.a).name,
    clubOf(trade.b).name,
    describe(trade.b, trade.bGives),
    describe(trade.a, trade.aGives),
  ];
  const move = (from: number, to: number, gives: TradeSide) => {
    for (const pid of gives.pids) {
      const p = world.players.find((x) => x.pid === pid) as Player;
      p.cid = to;
      p.shirtNumber = freeShirtNumber(world, to, 2);
      delete p.listed;
      p.transfers.push({ date, season, fromCid: from, toCid: to, fee: 0, type: "trade" });
      changed.add(pid);
    }
    const keys = new Set(gives.picks.map(keyOf));
    for (const pick of world.draftPicks ?? []) {
      if (keys.has(keyOf(pick))) pick.cid = to;
    }
  };
  move(trade.a, trade.b, trade.aGives);
  move(trade.b, trade.a, trade.bGives);
  return {
    changed,
    transaction: {
      season,
      date,
      type: "trade",
      pids: [...trade.aGives.pids, ...trade.bGives.pids],
      cids: [trade.a, trade.b],
      // [club a, club b, what a gets, what b gets]
      names,
      fee: 0,
    },
  };
}

/** What the trade is worth to its club `cid` (a or b): the AI says yes above zero. */
export function tradeValueFor(
  world: TradeWorld,
  day: TradeDay,
  trade: Trade,
  cid: number,
): ValueChange {
  return cid === trade.a
    ? valueChange(world, day, trade.a, trade.aGives, trade.bGives)
    : valueChange(world, day, trade.b, trade.bGives, trade.aGives);
}

export const aiAccepts = (change: ValueChange): boolean => change.dv > 0;

/**
 * "What would make this work?" (ZenGM): the AI club `ai` asks for more from the other club,
 * one asset at a time, up to `maxAdded`: the one that makes the trade good enough for it
 * at the smallest overpayment, else the one that helps it most. Only additions that keep
 * the trade valid count, and of the players only those `offered` allows. Returns the trade it would take (unchanged if it already would),
 * or null when nothing the other club has would do.
 */
export function makeItWork(
  world: TradeWorld,
  day: TradeDay,
  cal: TradeCalendar,
  trade: Trade,
  ai: number,
  maxAdded: number,
  offered: (p: Player) => boolean = () => true,
): Trade | null {
  const other = ai === trade.a ? trade.b : trade.a;
  const sideOf = (t: Trade) => (other === t.a ? t.aGives : t.bGives);
  const withSide = (t: Trade, side: TradeSide): Trade =>
    other === t.a ? { ...t, aGives: side } : { ...t, bGives: side };
  let current = trade;
  let dv = tradeValueFor(world, day, current, ai).dv;
  for (let added = 0; ; added++) {
    if (dv > 0) return current;
    if (added === maxAdded) return null;
    const side = sideOf(current);
    const inPids = new Set(side.pids);
    const inPicks = new Set(side.picks.map(keyOf));
    const candidates: Trade[] = [
      ...world.players
        .filter((p) => p.cid === other && p.status === "club" && !inPids.has(p.pid) && offered(p))
        .map((p) => withSide(current, { ...side, pids: [...side.pids, p.pid] })),
      ...world.draftPicks
        .filter((p) => p.cid === other && !inPicks.has(keyOf(p)))
        .map((p) =>
          withSide(current, {
            ...side,
            picks: [
              ...side.picks,
              { season: p.season, round: p.round, originalCid: p.originalCid },
            ],
          }),
        ),
    ];
    let best: { trade: Trade; dv: number } | null = null;
    for (const candidate of candidates) {
      if (tradeProblems(world, cal, day.date, candidate).length > 0) continue;
      const value = tradeValueFor(world, day, candidate, ai).dv;
      const better =
        best === null ||
        (value > 0 && (best.dv <= 0 || value < best.dv)) ||
        (value <= 0 && best.dv <= 0 && value > best.dv);
      if (better) best = { trade: candidate, dv: value };
    }
    if (!best || best.dv <= dv) return null;
    current = best.trade;
    dv = best.dv;
  }
}

/**
 * The most club `from` would add to a trade for club `to` (the trading block, SPEC §17.6):
 * one asset at a time, up to `maxAdded`, the one worth most to `to` that keeps the trade
 * good for `from` and valid, while each makes it better for `to`. Only players `offered`
 * allows. Returns the trade with what `from` adds (unchanged when it adds nothing).
 */
export function bestOffer(
  world: TradeWorld,
  day: TradeDay,
  cal: TradeCalendar,
  trade: Trade,
  from: number,
  maxAdded: number,
  offered: (p: Player) => boolean = () => true,
): Trade {
  const to = from === trade.a ? trade.b : trade.a;
  const sideOf = (t: Trade) => (from === t.a ? t.aGives : t.bGives);
  const withSide = (t: Trade, side: TradeSide): Trade =>
    from === t.a ? { ...t, aGives: side } : { ...t, bGives: side };
  let current = trade;
  let value = tradeValueFor(world, day, current, to).dv;
  for (let added = 0; added < maxAdded; added++) {
    const side = sideOf(current);
    const inPids = new Set(side.pids);
    const inPicks = new Set(side.picks.map(keyOf));
    let best: { trade: Trade; dv: number } | null = null;
    const candidates: Trade[] = [
      ...world.players
        .filter((p) => p.cid === from && p.status === "club" && !inPids.has(p.pid) && offered(p))
        .map((p) => withSide(current, { ...side, pids: [...side.pids, p.pid] })),
      ...world.draftPicks
        .filter((p) => p.cid === from && !inPicks.has(keyOf(p)))
        .map((p) =>
          withSide(current, {
            ...side,
            picks: [
              ...side.picks,
              { season: p.season, round: p.round, originalCid: p.originalCid },
            ],
          }),
        ),
    ];
    for (const candidate of candidates) {
      const dv = tradeValueFor(world, day, candidate, to).dv;
      if (dv <= value || (best && dv <= best.dv)) continue;
      if (!aiAccepts(tradeValueFor(world, day, candidate, from))) continue;
      if (tradeProblems(world, cal, day.date, candidate).length > 0) continue;
      best = { trade: candidate, dv };
    }
    if (!best) break;
    current = best.trade;
    value = best.dv;
  }
  return current;
}
