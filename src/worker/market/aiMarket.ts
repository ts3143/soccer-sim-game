/**
 * The AI's transfer market (SPEC §7.3, §7.5). On market days (weekly in each window from
 * a week after it opens, and deadline day) every AI club with a need may make one move:
 * a transfer from another AI club, a free-agent signing, or a bid for one of the user's
 * players, which waits in his inbox (the AI never acts for the user's club).
 *
 * Needs, from the club's best XI in its default formation:
 * - a thin squad (under 22 seniors): the area furthest below its target, any player fit
 *   to be a squad member;
 * - otherwise the weakest XI slot, when it is more than 3 below the XI level: a player at
 *   least 3 better there.
 * It looks no higher than its XI level + 6 (stars far above won't come or cost too much).
 *
 * The choice, among the best candidates in reach: affordable (fee within the transfer
 * budget, at most what the player is worth to the buyer; wage within its wage room), the
 * selling club keeps 18 seniors, and the player is willing. Score = his rating in the
 * slot (a developing club credits young players with half their headroom), less 0.3 per
 * 1% of the buyer's budget base the deal costs a year (fee over four years plus wage).
 */
import { addDays, exactAge } from "../../common/dates";
import { competitionsConfig, type CompetitionsConfig } from "../../common/config/competitions";
import { formationById, type FormationSlot } from "../../common/config/formations";
import { POSITIONS, type Position } from "../../common/config/ratings";
import type { Club, InboxMessage, Offer, Player, TransactionRow } from "../../common/schema";
import { bestXi } from "../core/lineup";
import { slotOvr } from "../core/ovr";
import { Random } from "../core/random";
import { seasonDate } from "../schedule/calendar";
import { transferBanned } from "../finance/ffp";
import { LOANS, loanEnd, loanHome, loanList, loansInByClub, rankAt, startLoan } from "./loans";
import { contractAsks, contractEnd, preferredYears } from "./market";
import { clubRevenue } from "./renewals";
import {
  askingPrice,
  clubBudgets,
  completeTransfer,
  euros,
  type MarketSnapshot,
  marketSnapshot,
  moodToward,
  refreshSnapshot,
  TRANSFERS,
  type TransferWorld,
} from "./transfers";

export const AI_MARKET = {
  /** Market days every this many days from the window's opening (and deadline day). */
  every: 7,
  /** Chance an AI club with a need acts on a market day. */
  actChance: 0.5,
  /** Signings per club per window, at most. */
  maxSignings: { summer: 3, winter: 2 } as Record<string, number>,
  /** Below this many seniors a club fills its thinnest area. */
  squadTarget: 22,
  /** Seniors per formation area a club aims for: GK, and per formation slot elsewhere. */
  areaTargets: { gk: 3, def: 2, mid: 2, att: 2 },
  /** Upgrade an XI slot this far below the XI level, with a player at least `gain` better. */
  upgradeBelowXi: 3,
  gain: 3,
  /** A squad filler may be this far below the XI level. */
  fillerBelowXi: 12,
  /** Look no higher than the XI level plus this. */
  reachAboveXi: 6,
  /** Candidates priced per need, best first: players at clubs, and free agents. */
  shortlist: 60,
  freeAgentShortlist: 15,
  loanShortlist: 15,
  /** Most a buyer pays: market value × this (× contender for a contending club). */
  buyerFactor: 1.4,
  contenderFactor: 1.2,
  /** A selling club keeps at least this many seniors. */
  sellerKeeps: 18,
  /** A contender buys no one older than this (except to fill the squad). */
  contenderMaxAge: 31,
  /** A developing club credits a player 23 or under with this share of his headroom. */
  youthBonus: 0.5,
  /** Score lost per 1% of the budget base the deal costs a year. */
  costPerPercent: 0.3,
  /** A free-agent filler may be paid this share of the budget base without wage room. */
  fillerWageShare: 0.01,
  /** Open bids for the user's unlisted players at once, at most (one per player). */
  maxOpenUserBids: 2,
  /** A listed player of the user's (M6): bids come in at least at this share of his price. */
  listedMinShare: 0.85,
  /** ...and a club that needs his position prefers him by this much. */
  listedBonus: 3,
};

const AREA: Record<Position, "gk" | "def" | "mid" | "att"> = {
  GK: "gk", CB: "def", FB: "def", WB: "def", DM: "mid", CM: "mid", WM: "mid", AM: "att", W: "att", ST: "att",
}; // prettier-ignore

export type NewOffer = Omit<Offer, "oid">;

export interface MarketWorld extends TransferWorld {
  seed: string;
  /** Bids for the user's players, open until `expires` (the AI adds its new ones). */
  openBids?: { pid: number; fromCid: number; expires: string }[];
}

export interface MarketLog {
  changed: Set<number>;
  transactions: Omit<TransactionRow, "xid">[];
  messages: Omit<InboxMessage, "mid">[];
  offers: NewOffer[];
  /** True if any player changed club (squads must be regrouped). */
  moved: boolean;
}

/** A season's market days per window: weekly from a week after opening, and deadline day. */
export function marketDays(
  season: number,
  config: CompetitionsConfig = competitionsConfig,
): { date: string; window: string; opens: string; deadline: boolean }[] {
  const out: { date: string; window: string; opens: string; deadline: boolean }[] = [];
  for (const w of config.windows) {
    const opens = seasonDate(season, w.opens);
    const deadline = seasonDate(season, w.deadlineDay);
    for (let d = addDays(opens, AI_MARKET.every); d < deadline; d = addDays(d, AI_MARKET.every)) {
      out.push({ date: d, window: w.id, opens, deadline: false });
    }
    out.push({ date: deadline, window: w.id, opens, deadline: true });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface Need {
  slot: FormationSlot;
  min: number;
  max: number;
  filler: boolean;
}

/** What the club most needs now, or null. */
export function needOf(club: Club, seniors: readonly Player[]): Need | null {
  const m = AI_MARKET;
  if (seniors.length >= TRANSFERS.maxSeniors) return null;
  const formation = formationById(club.tactics.formation);
  if (seniors.length < 11) {
    const slot = formation.slots[seniors.length] as FormationSlot;
    return { slot, min: 0, max: 99, filler: true };
  }
  const xi = bestXi(seniors, formation);
  const max = xi.meanOvr + m.reachAboveXi;
  if (seniors.length < m.squadTarget) {
    const slots = { gk: 0, def: 0, mid: 0, att: 0 };
    for (const slot of formation.slots) slots[AREA[slot.position]]++;
    const t = m.areaTargets;
    const target = {
      gk: t.gk,
      def: slots.def * t.def,
      mid: slots.mid * t.mid,
      att: slots.att * t.att,
    };
    const have = { gk: 0, def: 0, mid: 0, att: 0 };
    for (const p of seniors) have[AREA[p.position]]++;
    const area = (Object.keys(target) as (keyof typeof target)[]).sort(
      (x, y) => have[x] - target[x] - (have[y] - target[y]),
    )[0];
    const index = formation.slots
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => AREA[slot.position] === area)
      .sort((a, b) => (xi.slotOvrs[a.i] ?? 0) - (xi.slotOvrs[b.i] ?? 0))[0];
    if (index) return { slot: index.slot, min: xi.meanOvr - m.fillerBelowXi, max, filler: true };
  }
  let weakest = 0;
  xi.slotOvrs.forEach((v, i) => {
    if (v < (xi.slotOvrs[weakest] ?? 99)) weakest = i;
  });
  const value = xi.slotOvrs[weakest] ?? 0;
  if (value >= xi.meanOvr - m.upgradeBelowXi) return null;
  return {
    slot: formation.slots[weakest] as FormationSlot,
    min: value + m.gain,
    max,
    filler: false,
  };
}

type Pools = Map<Position, Player[]>;

/** Players with this status, best first at each position. */
function candidatePools(players: readonly Player[], status: Player["status"]): Pools {
  const pools: Pools = new Map();
  const open = players.filter((p) => p.status === status);
  POSITIONS.forEach((position, i) => {
    pools.set(
      position,
      [...open].sort((a, b) => (b.ovrs[i] ?? 0) - (a.ovrs[i] ?? 0) || a.pid - b.pid),
    );
  });
  return pools;
}

interface Choice {
  p: Player;
  fee: number;
  /** The wage the buyer pays (a loan: its share). */
  wage: number;
  years: number;
  score: number;
  loan: boolean;
}

/** The best deal a club can make for its need, or null. */
function bestChoice(
  world: MarketWorld,
  club: Club,
  need: Need,
  pools: { atClubs: Pools; free: Pools; loanable: Pools; loansIn: Map<number, number> },
  snap: MarketSnapshot,
  date: string,
  deadline: boolean,
): Choice | null {
  const m = AI_MARKET;
  const budgets = clubBudgets(world, club);
  const base = world.clubSeasons.get(club.cid)?.budgetBase ?? club.revenueAnchor;
  const strategy = snap.strategies.get(club.cid) ?? "developing";
  const revenue = clubRevenue(world, club);
  // Bids lapse once their deadline day is played (as the save marks them).
  const bids = (world.openBids ?? []).filter((b) => date < b.expires);
  let best: Choice | null = null;
  const inRange = inReach(pools.atClubs, need, club.cid, m.shortlist);
  // The user's transfer list (M6): a listed player who fits the need is always considered,
  // not only when he is among the best in reach.
  const listed = (pools.atClubs.get(need.slot.position) ?? []).filter((p) => {
    if (p.cid !== world.userCid || !p.listed || inRange.includes(p)) return false;
    const rating = slotOvr(p, need.slot);
    return rating >= need.min && rating <= need.max;
  });
  const shortlist = [
    ...inRange,
    ...listed,
    ...inReach(pools.free, need, club.cid, m.freeAgentShortlist),
  ];
  for (const p of shortlist) {
    const rating = slotOvr(p, need.slot);
    const age = exactAge(p.birthDate, date);
    if (strategy === "contending" && !need.filler && age > m.contenderMaxAge) continue;
    let fee = 0;
    // The user's transfer list (M6): he sets the price, so his squad size doesn't stop it.
    const listed = p.status === "club" && p.cid === world.userCid ? p.listed : undefined;
    if (p.status === "club") {
      if (!listed && (snap.seniors.get(p.cid as number)?.length ?? 0) <= m.sellerKeeps) continue;
      if (p.cid === world.userCid) {
        const open =
          bids.some((b) => b.pid === p.pid) || (!listed && bids.length >= m.maxOpenUserBids);
        if (deadline || open) continue;
      }
      const valuation = askingPrice(world, p, date, snap);
      const worth =
        valuation.value * m.buyerFactor * (strategy === "contending" ? m.contenderFactor : 1);
      if (listed) {
        const offer = Math.min(listed.asking, worth, budgets.transfer);
        if (offer < m.listedMinShare * listed.asking) continue;
        fee = Math.round(offer / 10_000) * 10_000;
      } else {
        if (valuation.asking > worth || valuation.asking > budgets.transfer) continue;
        fee = valuation.asking;
      }
    }
    const mood = moodToward(world, p, club, date, snap);
    if (!mood.willing) continue;
    const years = preferredYears(age);
    const wage =
      contractAsks(p, date, revenue, mood.value, false).find((a) => a.years === years)?.wage ??
      Infinity;
    const filler = need.filler && fee === 0 && wage <= m.fillerWageShare * base;
    if (wage > budgets.wageRoom && !filler) continue;
    const youth =
      strategy === "developing" && age <= 23 ? m.youthBonus * Math.max(0, p.pot - p.ovr) : 0;
    const cost = (fee / TRANSFERS.budget.feeYears + wage) / (0.01 * base);
    const score = rating + youth - m.costPerPercent * cost + (listed ? m.listedBonus : 0);
    if (!best || score > best.score) best = { p, fee, wage, years, score, loan: false };
  }
  // Loans: young players another AI club would lend, if he'd play here.
  if ((pools.loansIn.get(club.cid) ?? 0) < LOANS.maxIn) {
    const squad = snap.seniors.get(club.cid) ?? [];
    for (const p of inReach(pools.loanable, need, club.cid, m.loanShortlist)) {
      if (p.status !== "club" || rankAt(squad, p) >= LOANS.playsIfRankBelow) continue;
      if (!moodToward(world, p, club, date, snap).willing) continue;
      const wage = (p.contract?.wage ?? 0) * LOANS.aiWageShare;
      const filler = need.filler && wage <= m.fillerWageShare * base;
      if (wage > budgets.wageRoom && !filler) continue;
      const score = slotOvr(p, need.slot) - m.costPerPercent * (wage / (0.01 * base));
      if (!best || score > best.score) best = { p, fee: 0, wage, years: 0, score, loan: true };
    }
  }
  return best;
}

/** The best `count` players in a pool within the need's rating range, not the club's own. */
function inReach(pools: Pools, need: Need, cid: number, count: number): Player[] {
  const out: Player[] = [];
  for (const p of pools.get(need.slot.position) ?? []) {
    if (out.length >= count) break;
    if (p.cid === cid || (p.status !== "club" && p.status !== "freeAgent")) continue;
    const rating = slotOvr(p, need.slot);
    if (rating > need.max) continue;
    if (rating < need.min) break;
    out.push(p);
  }
  return out;
}

/** Signings a club has made in this window so far. */
const signedSince = (players: readonly Player[], cid: number, opens: string) =>
  players.filter((p) =>
    p.transfers.some(
      (t) =>
        t.toCid === cid &&
        t.date >= opens &&
        (t.type === "transfer" || t.type === "freeAgent" || t.type === "loan") &&
        p.cid === cid,
    ),
  ).length;

/** One market day: AI clubs in a seeded order, each making at most one move. */
export function marketDay(
  world: MarketWorld,
  season: number,
  day: { date: string; window: string; opens: string; deadline: boolean },
): MarketLog {
  const { date, window, opens, deadline } = day;
  const log: MarketLog = {
    changed: new Set(),
    transactions: [],
    messages: [],
    offers: [],
    moved: false,
  };
  const rng = Random.fromSeed(`${world.seed}/market/${date}`);
  const snap = marketSnapshot(world, date);
  const pools = {
    atClubs: candidatePools(world.players, "club"),
    free: candidatePools(world.players, "freeAgent"),
    loanable: candidatePools(loanList(world, date, snap), "club"),
    loansIn: loansInByClub(world.players),
  };
  const closes = seasonDate(
    season,
    competitionsConfig.windows.find((w) => w.id === window)?.closes ?? "08-31",
  );
  const maxSignings = AI_MARKET.maxSignings[window] ?? 2;
  const order = rng.shuffle(world.clubs.filter((c) => c.cid !== world.userCid));
  for (const club of order) {
    if (!rng.bool(AI_MARKET.actChance)) continue;
    if (transferBanned(club, date)) continue; // FFP ban: no signings this window
    if (signedSince(world.players, club.cid, opens) >= maxSignings) continue;
    const need = needOf(club, snap.seniors.get(club.cid) ?? []);
    if (!need) continue;
    const choice = bestChoice(world, club, need, pools, snap, date, deadline);
    if (!choice) continue;
    const { p } = choice;
    if (p.status === "club" && p.cid === world.userCid) {
      // A bid for the user's player: he answers it in his inbox.
      const offer: NewOffer = {
        pid: p.pid,
        fromCid: club.cid,
        toCid: world.userCid,
        kind: "transfer",
        status: "open",
        fee: choice.fee,
        expires: closes,
        date,
        season,
      };
      log.offers.push(offer);
      (world.openBids ??= []).push({ pid: p.pid, fromCid: club.cid, expires: closes });
      log.messages.push({
        date,
        season,
        kind: "transfer",
        subject: `Bid for ${p.firstName} ${p.lastName}`.trim(),
        body: `${club.name} bid ${euros(choice.fee)} for ${`${p.firstName} ${p.lastName}`.trim()} (${p.position}, ${p.ovr}). Accept or reject it before the window closes on ${closes}.`,
        read: false,
      });
      continue;
    }
    const sellerCid = p.status === "club" ? (p.cid as number) : null;
    const done = choice.loan
      ? startLoan(world, {
          pid: p.pid,
          toCid: club.cid,
          until: loanEnd(season, date, "season"),
          wageShare: LOANS.aiWageShare,
          date,
          season,
        })
      : completeTransfer(world, {
          pid: p.pid,
          toCid: club.cid,
          fee: choice.fee,
          wage: choice.wage,
          expires: contractEnd(season, choice.years, date),
          date,
          season,
        });
    for (const pid of done.changed) log.changed.add(pid);
    log.transactions.push(...done.transactions);
    log.messages.push(...done.messages);
    log.moved = true;
    if (choice.loan) pools.loansIn.set(club.cid, (pools.loansIn.get(club.cid) ?? 0) + 1);
    refreshSnapshot(world, snap, sellerCid === null ? [club.cid] : [club.cid, sellerCid]);
  }
  placeLoans(world, season, date, snap, rng, log, pools.loansIn);
  return log;
}

/**
 * Loan placements: each AI club with listed prospects tries to place one (the best by POT)
 * with a club at about his level where he'd play (SPEC §7.4: minutes for development).
 */
function placeLoans(
  world: MarketWorld,
  season: number,
  date: string,
  snap: MarketSnapshot,
  rng: Random,
  log: MarketLog,
  inCount: Map<number, number>,
) {
  const listed = loanList(world, date, snap);
  const byParent = new Map<number, Player[]>();
  for (const p of listed)
    byParent.set(p.cid as number, [...(byParent.get(p.cid as number) ?? []), p]);
  for (const cid of rng.shuffle([...byParent.keys()].sort((a, b) => a - b))) {
    if (!rng.bool(AI_MARKET.actChance)) continue;
    const prospect = [...(byParent.get(cid) ?? [])].sort(
      (a, b) => b.pot - a.pot || a.pid - b.pid,
    )[0];
    if (!prospect || prospect.status !== "club") continue;
    const home = loanHome(
      world,
      prospect,
      snap,
      (club) => clubBudgets(world, club).wageRoom,
      inCount,
    );
    if (!home || !moodToward(world, prospect, home.club, date, snap).willing) continue;
    const done = startLoan(world, {
      pid: prospect.pid,
      toCid: home.club.cid,
      until: loanEnd(season, date, "season"),
      wageShare: home.wageShare,
      date,
      season,
    });
    for (const pid of done.changed) log.changed.add(pid);
    log.transactions.push(...done.transactions);
    log.messages.push(...done.messages);
    log.moved = true;
    inCount.set(home.club.cid, (inCount.get(home.club.cid) ?? 0) + 1);
    refreshSnapshot(world, snap, [cid, home.club.cid]);
  }
}
