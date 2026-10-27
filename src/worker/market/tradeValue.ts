/**
 * Trade valuation (SPEC §17.6; the Super League's): what a trade is worth to a club, in
 * value points (1 = a 75-rated player in his prime on a fair contract). ZenGM's idea,
 * written fresh:
 * - a player's value is exponential in a rating that blends OVR and POT by the club's
 *   outlook (contending clubs want OVR now; rebuilding ones POT and youth), less for age,
 *   and priced by his contract (wage against a fair one at the league's wage level, years
 *   left; a final year counts less);
 * - a squad counts by place, its best 11 fully and the rest less, so two average players
 *   never buy a star;
 * - a pick is worth the prospect its slot would take from a typical class (the visible
 *   classes' prospects valued at their draft, the best first, averaged place by place),
 *   less a share a draft further away; a stronger original owner means a later slot;
 * - cap room is worth more to a club over the cap, and more to a rebuilding one.
 * A club takes a trade that raises its value (chunk 2).
 */
import type { TradeState, TradesConfig } from "../../common/config/competitions";
import type { WorldConfig } from "../../common/config/worlds";
import { exactAge } from "../../common/dates";
import type { Club, ClubSeason, DraftPick, Player } from "../../common/schema";
import { clubStrength } from "../club/standing";
import { clubCap, payroll } from "../finance/softCap";
import { seasonDate } from "../schedule/calendar";
import { draftOrder } from "../season/draft";
import type { ClubMove } from "../season/season";
import { marketWage, yearsLeft } from "./market";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** What valuing trades reads (a save's cache or the harness's world). */
export interface TradeWorld {
  config: WorldConfig;
  clubs: readonly Club[];
  players: readonly Player[];
  clubSeasons: ReadonlyMap<number, ClubSeason>;
  draftPicks: readonly DraftPick[];
}

/** A pick, by its key. */
export type PickRef = Pick<DraftPick, "season" | "round" | "originalCid">;

/** What one club gives in a trade. */
export interface TradeSide {
  pids: number[];
  picks: PickRef[];
}

/** The day's facts for valuing trades: the draft ahead, projected slots, the classes. */
export interface TradeDay {
  season: number;
  date: string;
  /** The season whose draft comes next. */
  nextDraft: number;
  /** Each club's projected slot in a round (1 = first), as its picks' original owner. */
  slots: ReadonlyMap<number, number>;
  /** A typical class by outlook: the value at each overall pick, best first. */
  slotValues: Readonly<Record<TradeState, readonly number[]>>;
  /** The league's wages against the going rate: worth × this is a fair wage. */
  wageLevel: number;
}

/** How a club values trades today. */
export interface ClubView {
  cid: number;
  state: TradeState;
  /** Its cap (null: no cap) and the revenue its wages are priced at. */
  cap: number | null;
  revenue: number;
}

/** A trade's worth to one club, in value points, and its parts. */
export interface ValueChange {
  dv: number;
  squad: number;
  picks: number;
  salary: number;
}

const tradesOf = (world: Pick<TradeWorld, "config">): TradesConfig => {
  const trades = world.config.competitions.trades;
  if (!trades) throw new Error("This world has no trades");
  return trades;
};

const keyOf = (p: PickRef) => `${p.season}/${p.round}/${p.originalCid}`;

/** A club contends when its board's target is a contending one, else it rebuilds. */
export function tradeState(world: Pick<TradeWorld, "config" | "clubSeasons">, cid: number) {
  const target = world.clubSeasons.get(cid)?.boardExpectation ?? null;
  const state: TradeState =
    target !== null && tradesOf(world).contendingTargets.includes(target)
      ? "contending"
      : "rebuilding";
  return state;
}

export function clubView(world: TradeWorld, cid: number, season: number): ClubView {
  const club = world.clubs.find((c) => c.cid === cid);
  if (!club) throw new Error(`No club ${cid}`);
  const competitions = world.config.competitions;
  const cap = clubCap(competitions, club, season);
  const ratio = competitions.softCap?.aiWageRatio;
  return {
    cid,
    state: tradeState(world, cid),
    cap,
    revenue: cap !== null && ratio ? cap / ratio : club.revenueAnchor,
  };
}

/**
 * The order the draft would take if the season ended with these tables (cids top first per
 * league), or before a match is played with the leagues ordered by squad strength: the
 * clubs at the bottom go down, those at the top up (play-off places included), and the
 * lottery pool goes in odds order. Returns each club's slot in a round.
 */
export function projectedSlots(
  world: Pick<TradeWorld, "config" | "clubs" | "players">,
  date: string,
  tables?: Readonly<Record<string, readonly number[]>>,
): Map<number, number> {
  const competitions = world.config.competitions;
  const draft = competitions.draft;
  if (!draft) return new Map();
  const projected: Record<string, { cid: number; position: number }[]> = {};
  for (const league of competitions.leagues) {
    const cids =
      tables?.[league.id] ??
      world.clubs
        .filter((c) => c.leagueId === league.id)
        .map((c) => ({ cid: c.cid, strength: clubStrength(world.players, c.cid, date) }))
        .sort((a, b) => b.strength - a.strength || a.cid - b.cid)
        .map((c) => c.cid);
    projected[league.id] = cids.map((cid, i) => ({ cid, position: i + 1 }));
  }
  const moves: ClubMove[] = [];
  for (const league of competitions.leagues) {
    const table = projected[league.id] ?? [];
    if (league.relegation) {
      for (const r of table.slice(-league.relegation.places)) {
        moves.push({ cid: r.cid, from: league.id, to: league.relegation.to, reason: "relegated" });
      }
    }
    if (league.promotion) {
      const up = league.promotion.automatic + league.promotion.promotedPlaces;
      for (const r of table.slice(0, up)) {
        moves.push({ cid: r.cid, from: league.id, to: league.promotion.to, reason: "promoted" });
      }
    }
  }
  const tiers = new Map(competitions.leagues.map((l) => [l.id, l.tier]));
  const order = draftOrder(draft, { tables: projected, moves }, tiers);
  return new Map(order.map((cid, i) => [cid, i + 1]));
}

const draftDateOf = (config: WorldConfig, season: number) =>
  seasonDate(season, config.competitions.keyDates.draft ?? "06-15");

/**
 * A typical class's value at each overall pick, by outlook: each visible class (the coming
 * draft's whole, its drafted players too, and those after it) valued at its draft, best
 * first, averaged place by place over the classes.
 */
function slotValues(
  world: Pick<TradeWorld, "config" | "players">,
  season: number,
  nextDraft: number,
): Record<TradeState, number[]> {
  const draft = world.config.competitions.draft;
  const out: Record<TradeState, number[]> = { contending: [], rebuilding: [] };
  const trades = world.config.competitions.trades;
  if (!draft || !trades) return out;
  const classes = new Map<number, Player[]>();
  for (const p of world.players) {
    const s = p.draft?.season ?? (p.status === "prospect" ? p.draftSeason : undefined);
    if (s === undefined || s < nextDraft) continue;
    const list = classes.get(s);
    if (list) list.push(p);
    else classes.set(s, [p]);
  }
  for (const state of ["contending", "rebuilding"] as const) {
    const sums: number[] = [];
    const counts: number[] = [];
    for (const [s, prospects] of classes) {
      const growth = draft.prospectQuality.growthPerYear * Math.max(0, s - season);
      const at = draftDateOf(world.config, s);
      prospects
        .map((p) =>
          p.draft
            ? talentValue(trades, p, exactAge(p.birthDate, at), state)
            : talentValue(
                trades,
                { ovr: p.ovr + growth, pot: p.pot },
                exactAge(p.birthDate, at),
                state,
              ),
        )
        .sort((a, b) => b - a)
        .forEach((v, i) => {
          sums[i] = (sums[i] ?? 0) + v;
          counts[i] = (counts[i] ?? 0) + 1;
        });
    }
    out[state] = sums.map((sum, i) => sum / (counts[i] ?? 1));
  }
  return out;
}

/** Wages paid against the going rate at each club's cap (1 without a cap). */
function wageLevel(
  world: Pick<TradeWorld, "config" | "clubs" | "players">,
  season: number,
  date: string,
) {
  const competitions = world.config.competitions;
  const ratio = competitions.softCap?.aiWageRatio;
  if (!ratio) return 1;
  const revenue = new Map(
    world.clubs.map((c) => [c.cid, (clubCap(competitions, c, season) ?? 0) / ratio]),
  );
  let paid = 0;
  let going = 0;
  for (const p of world.players) {
    if (p.status !== "club" || p.cid === null || !p.contract) continue;
    paid += p.contract.wage;
    going += marketWage(p.ovr, exactAge(p.birthDate, date), revenue.get(p.cid) ?? 0);
  }
  return going > 0 ? paid / going : 1;
}

/** The day's facts for valuing trades (`tables` as `projectedSlots`). */
export function tradeDay(
  world: Pick<TradeWorld, "config" | "clubs" | "players">,
  season: number,
  date: string,
  tables?: Readonly<Record<string, readonly number[]>>,
): TradeDay {
  const nextDraft = date > draftDateOf(world.config, season) ? season + 1 : season;
  return {
    season,
    date,
    nextDraft,
    slots: projectedSlots(world, date, tables),
    slotValues: slotValues(world, season, nextDraft),
    wageLevel: wageLevel(world, season, date),
  };
}

/**
 * What a player's ability is worth to a club in `state`, his contract aside: exponential in
 * OVR plus a share of a young player's headroom to POT, less for each year past his peak.
 */
export function talentValue(
  trades: TradesConfig,
  p: Pick<Player, "ovr" | "pot">,
  age: number,
  state: TradeState,
): number {
  const v = trades.value;
  const youth = clamp((v.youthNoneFrom - age) / (v.youthNoneFrom - v.youthFullUntil), 0, 1);
  const rating = p.ovr + v.potShare[state] * youth * Math.max(0, p.pot - p.ovr);
  let value = Math.exp(v.perOvr * (rating - 75));
  const past = age - v.declineFrom[state];
  if (past > 0) value *= v.declinePerYear[state] ** past;
  return value;
}

/** A player's value to the club: his talent, priced by his contract. */
export function playerTradeValue(
  trades: TradesConfig,
  p: Player,
  club: ClubView,
  day: Pick<TradeDay, "season" | "date" | "wageLevel">,
): number {
  const age = exactAge(p.birthDate, day.date);
  let value = talentValue(trades, p, age, club.state);
  const wage = p.contract?.wage ?? 0;
  if (wage > 0) {
    const c = trades.value.contract;
    const worth = marketWage(p.ovr, age, club.revenue) * day.wageLevel;
    const years = Math.min(yearsLeft(p, day.date), c.years) / c.years;
    value *= clamp(1 + c.weight * (worth / wage - 1) * years, c.min, c.max);
  }
  if (p.contract?.expires === `${day.season + 1}-06-30`)
    value *= trades.value.finalYear[club.state];
  return value;
}

/**
 * A pick's value to the club: a typical class's value at its overall pick (its number once
 * the lottery has set it, else from its original owner's projected slot), less a share a
 * draft further away.
 */
export function pickTradeValue(
  world: Pick<TradeWorld, "config" | "clubs">,
  day: TradeDay,
  club: ClubView,
  pick: DraftPick,
): number {
  const trades = tradesOf(world);
  const clubs = world.clubs.length;
  const overall =
    pick.pick ?? (pick.round - 1) * clubs + (day.slots.get(pick.originalCid) ?? clubs);
  const value = day.slotValues[club.state][overall - 1] ?? 0;
  const ahead = Math.max(0, pick.season - day.nextDraft);
  return value * trades.picks.weight[club.state] * trades.picks.yearDiscount ** ahead;
}

/** A squad's worth: values best first, each place weighted by `squadWeights`. */
export function squadValue(trades: TradesConfig, values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  let total = 0;
  sorted.forEach((v, i) => {
    total += v * (trades.squadWeights.find(([upTo]) => i + 1 <= upTo)?.[1] ?? 0);
  });
  return total;
}

/** What a payroll costs the club in value points: more for the part above its cap. */
function payrollCost(trades: TradesConfig, club: ClubView, amount: number): number {
  if (club.cap === null) return 0;
  const s = trades.salary;
  const cost =
    (s.underCap * Math.min(amount, club.cap) + s.overCap * Math.max(0, amount - club.cap)) /
    club.cap;
  return club.state === "rebuilding" ? cost * s.rebuilding : cost;
}

/**
 * What a trade is worth to club `cid`: it gives `gives` and gets `gets`. Its squad (by
 * place), its picks and its cap room, after less before.
 */
export function valueChange(
  world: TradeWorld,
  day: TradeDay,
  cid: number,
  gives: TradeSide,
  gets: TradeSide,
): ValueChange {
  const trades = tradesOf(world);
  const club = clubView(world, cid, day.season);
  const byPid = new Map(world.players.map((p) => [p.pid, p]));
  const out = new Set(gives.pids);
  const incoming = gets.pids.map((pid) => {
    const p = byPid.get(pid);
    if (!p) throw new Error(`No player ${pid}`);
    return p;
  });
  const value = (p: Player) => playerTradeValue(trades, p, club, day);
  const squad = world.players.filter((p) => p.cid === cid && p.status === "club");
  const before = squad.map(value);
  const after = [...squad.filter((p) => !out.has(p.pid)), ...incoming].map(value);
  const squadDv = squadValue(trades, after) - squadValue(trades, before);

  const picks = new Map(world.draftPicks.map((p) => [keyOf(p), p]));
  const pickValue = (ref: PickRef) => {
    const pick = picks.get(keyOf(ref));
    if (!pick) throw new Error(`No pick ${keyOf(ref)}`);
    return pickTradeValue(world, day, club, pick);
  };
  const picksDv =
    gets.picks.reduce((s, p) => s + pickValue(p), 0) -
    gives.picks.reduce((s, p) => s + pickValue(p), 0);

  const clubRow = world.clubs.find((c) => c.cid === cid) as Club;
  const wages = (ps: readonly Player[]) => ps.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  const now = payroll(clubRow, world.players, day.date);
  const then = now - wages(squad.filter((p) => out.has(p.pid))) + wages(incoming);
  const salary = payrollCost(trades, club, now) - payrollCost(trades, club, then);

  return { dv: squadDv + picksDv + salary, squad: squadDv, picks: picksDv, salary };
}
