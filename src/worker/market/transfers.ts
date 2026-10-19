/**
 * Transfers (SPEC §7.3, §6.3): club strategy, budgets, valuation and the deal itself.
 *
 * - Strategy: a club whose board wants a top-four finish (or better) is contending; one
 *   with negative cash or a squad cost above the FFP ratio is selling; the rest develop.
 * - Budgets: the FFP headroom (70% of the budget base less wages and fee amortisation) is
 *   split between wages and fees by one control (default half each; a fee counts against
 *   it spread over four years). The transfer budget is also capped by cash in hand, less a
 *   reserve, plus half the projected profit. Negative cash freezes transfers.
 * - Valuation (the asking price): market value × importance to the squad (by OVR rank) ×
 *   strategy (a contender wants a premium for a starter, more in January; a developing
 *   club prizes its young and lets veterans go cheaper; a seller takes 90%) × a small
 *   discount when the player is unhappy. Market value is exponential in OVR, so two
 *   average players' fees never buy a star.
 * - The deal, in two steps: the clubs agree a fee (a bid at the asking price is accepted;
 *   from 80% of it the club counters with its price; below, it says no), then the player
 *   agrees personal terms (his mood toward the buying club and his wage ask).
 */
import { exactAge } from "../../common/dates";
import type { Club, ClubSeason, InboxMessage, Player, TransactionRow } from "../../common/schema";
import { targetPosition } from "../club/board";
import { clubStrength } from "../club/standing";
import { credit, debit, dialCost } from "../finance/finance";
import { marketValue, type Mood, playerMood, signContract, yearsLeft } from "./market";
import { clubLevels, moodAtClub, type ContractWorld } from "./renewals";

export const TRANSFERS = {
  /** Importance to its squad by OVR rank: [up to rank, factor]; starters are the best 11. */
  importance: [
    [11, 1.3],
    [16, 1],
    [22, 0.8],
    [99, 0.6],
  ] as [number, number][],
  strategy: {
    /** Board target position at or above which a club contends (ENG1 title and top four). */
    contendingFrom: 4,
    contenderStarter: { summer: 1.2, winter: 1.5 },
    developingYoung: { upToAge: 23, factor: 1.2 },
    developingVeteran: { fromAge: 30, factor: 0.85 },
    seller: 0.9,
  },
  /** Unhappy players come cheaper: × (1 + unhappyDiscount × mood) when mood is negative. */
  unhappyDiscount: 0.15,
  /** A bid from this share of the asking price draws a counter at the asking price. */
  counterFrom: 0.8,
  budget: {
    ffpRatio: 0.7,
    /** Cash kept back, as a share of the budget base. */
    reserve: 0.1,
    /** Share of the projected season profit counted on top of cash. */
    profitShare: 0.5,
    /** A fee counts against the FFP headroom spread over this many years. */
    feeYears: 4,
    /** Default share of the headroom for wages (the rest backs fees). */
    wageShare: 0.5,
  },
  maxSeniors: 25,
  /** Expected share of minutes at the buying club by where he'd rank in its squad. */
  expectedMinutes: [
    [11, 0.8],
    [16, 0.45],
    [99, 0.15],
  ] as [number, number][],
};

export type Strategy = "contending" | "developing" | "selling";
export type BidOutcome = "accepted" | "countered" | "rejected";

export interface TransferWorld extends ContractWorld {
  clubSeasons: ReadonlyMap<number, ClubSeason>;
}

export interface TransferLog {
  changed: Set<number>;
  transactions: Omit<TransactionRow, "xid">[];
  messages: Omit<InboxMessage, "mid">[];
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const lookup = (pairs: readonly [number, number][], x: number) =>
  pairs.find(([upTo]) => x < upTo)?.[1] ?? 1;
const euroFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
export const euros = (amount: number): string => euroFormat.format(amount);

/** A club's seniors, best first. */
export const seniorsOf = (players: readonly Player[], cid: number): Player[] =>
  players
    .filter((p) => p.cid === cid && p.status === "club")
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);

/** Annual squad cost: wages plus the year's share of transfer fees (SPEC §6.4). */
export function squadCost(players: readonly Player[], cid: number) {
  let wages = 0;
  let amortisation = 0;
  for (const p of players) {
    if (p.cid !== cid || (p.status !== "club" && p.status !== "academy")) continue;
    wages += p.contract?.wage ?? 0;
    amortisation += p.feeBalance?.perYear ?? 0;
  }
  return { wages, amortisation, total: wages + amortisation };
}

const budgetBaseOf = (world: TransferWorld, club: Club) =>
  world.clubSeasons.get(club.cid)?.budgetBase ?? club.revenueAnchor;

/** The club's transfer strategy now. */
export function clubStrategy(world: TransferWorld, club: Club): Strategy {
  const base = budgetBaseOf(world, club);
  if (club.cash < 0 || squadCost(world.players, club.cid).total > TRANSFERS.budget.ffpRatio * base)
    return "selling";
  const row = world.clubSeasons.get(club.cid);
  const target = row ? targetPosition(row.leagueId, row.boardExpectation) : 99;
  return target <= TRANSFERS.strategy.contendingFrom ? "contending" : "developing";
}

export interface Budgets {
  /** Fees the club can pay now (0 when cash is negative). */
  transfer: number;
  /** Extra wages a year the club can take on. */
  wageRoom: number;
  squadCost: number;
  /** The FFP limit on squad cost (70% of the budget base). */
  limit: number;
}

/** Transfer budget and wage room (SPEC §6.3); `wageShare` is the user's control (0–1). */
export function clubBudgets(
  world: TransferWorld,
  club: Club,
  wageShare: number = club.wageShare ?? TRANSFERS.budget.wageShare,
): Budgets {
  const b = TRANSFERS.budget;
  const base = budgetBaseOf(world, club);
  const cost = squadCost(world.players, club.cid).total;
  const limit = b.ffpRatio * base;
  const headroom = Math.max(0, limit - cost);
  const { coaching, youth, medical, facilities } = club.budget;
  const dials = [coaching, youth, medical, facilities].reduce(
    (s: number, level: number) => s + dialCost(level, base),
    0,
  );
  const profit = Math.max(0, base - cost - dials);
  const cash = club.cash - b.reserve * base + b.profitShare * profit;
  const share = Math.min(1, Math.max(0, wageShare));
  return {
    transfer:
      club.cash < 0
        ? 0
        : Math.round(Math.max(0, Math.min(cash, headroom * (1 - share) * b.feeYears))),
    wageRoom: Math.round(headroom * share),
    squadCost: cost,
    limit: Math.round(limit),
  };
}

/** Average best-XI OVR of a league's clubs (market value's league level). */
export function leagueLevel(world: TransferWorld, leagueId: string, date: string): number {
  const clubs = world.clubs.filter((c) => c.leagueId === leagueId);
  const total = clubs.reduce((s, c) => s + clubStrength(world.players, c.cid, date), 0);
  return total / Math.max(1, clubs.length);
}

/** His average match rating this half-season, once he has played enough. */
const formOf = (p: Player): number | undefined =>
  p.devTally && p.devTally.appearances >= 5
    ? p.devTally.ratingTotal / p.devTally.appearances
    : undefined;

export interface Valuation {
  value: number;
  asking: number;
  strategy: Strategy;
  /** 0-based rank by OVR in his club's squad. */
  rank: number;
}

/** What his club asks for him (SPEC §7.3). `level` = his league's level, if known. */
export function askingPrice(
  world: TransferWorld,
  p: Player,
  date: string,
  level?: number,
): Valuation {
  const club = world.clubs.find((c) => c.cid === p.cid);
  if (!club) throw new Error(`Player ${p.pid} is not at a club`);
  const s = TRANSFERS.strategy;
  const value = marketValue(p, date, level ?? leagueLevel(world, club.leagueId, date), formOf(p));
  const rank = seniorsOf(world.players, club.cid).findIndex((x) => x.pid === p.pid);
  const strategy = clubStrategy(world, club);
  const age = exactAge(p.birthDate, date);
  let factor = lookup(TRANSFERS.importance, rank < 0 ? 99 : rank);
  if (strategy === "contending" && rank >= 0 && rank < 11) {
    factor *= Number(date.slice(5, 7)) <= 6 ? s.contenderStarter.winter : s.contenderStarter.summer;
  } else if (strategy === "developing") {
    if (age <= s.developingYoung.upToAge) factor *= s.developingYoung.factor;
    else if (age >= s.developingVeteran.fromAge) factor *= s.developingVeteran.factor;
  } else if (strategy === "selling") {
    factor *= s.seller;
  }
  const mood = moodAtClub(world, p, date)?.value ?? 0;
  if (mood < 0) factor *= 1 + TRANSFERS.unhappyDiscount * mood;
  const asking = Math.max(value, Math.round((value * factor) / 10_000) * 10_000);
  return { value, asking: rank < 0 ? value : asking, strategy, rank };
}

/** The selling club's answer to a bid. */
export function bidOutcome(fee: number, asking: number): BidOutcome {
  if (fee >= asking) return "accepted";
  return fee >= TRANSFERS.counterFrom * asking ? "countered" : "rejected";
}

/** His mood toward a club that wants to sign him (no years there; minutes by his rank). */
export function moodToward(world: TransferWorld, p: Player, buyer: Club, date: string): Mood {
  const season = world.clubSeasons.get(buyer.cid);
  if (!season) throw new Error(`No season row for club ${buyer.cid}`);
  const squad = seniorsOf(world.players, buyer.cid).filter((x) => x.pid !== p.pid);
  const rank = squad.filter((x) => x.ovr > p.ovr).length;
  return playerMood(p, {
    club: buyer,
    season,
    success: season.boardConfidence ?? 50,
    minutesShare: lookup(TRANSFERS.expectedMinutes, rank),
    yearsAtClub: 0,
    levels: {
      club: clubStrength(world.players, buyer.cid, date),
      top: clubLevels(world, date).top,
      date,
    },
  });
}

/** Lowest shirt number free at the club (1 is kept for goalkeepers). */
function freeShirtNumber(players: readonly Player[], cid: number, gk: boolean): number {
  const taken = new Set(players.filter((p) => p.cid === cid).map((p) => p.shirtNumber));
  for (let n = gk ? 1 : 2; n < 100; n++) if (!taken.has(n)) return n;
  return 99;
}

export interface Deal {
  pid: number;
  toCid: number;
  fee: number;
  wage: number;
  expires: string;
  date: string;
  season: number;
}

/**
 * Completes a transfer or a free-agent signing: money (fee paid up front, SPEC §6.3), the
 * player's move and new contract, the fee to amortise, the log and the user's inbox.
 */
export function completeTransfer(world: TransferWorld, deal: Deal): TransferLog {
  const p = world.players.find((x) => x.pid === deal.pid);
  const buyer = world.clubs.find((c) => c.cid === deal.toCid);
  const buyerRow = world.clubSeasons.get(deal.toCid);
  if (!p || !buyer || !buyerRow) throw new Error(`Can't complete deal for player ${deal.pid}`);
  const fromCid = p.status === "club" ? p.cid : null;
  const seller = world.clubs.find((c) => c.cid === fromCid);
  const sellerRow = fromCid === null ? undefined : world.clubSeasons.get(fromCid);
  if (deal.fee > 0) {
    debit({ club: buyer, season: buyerRow }, "transfers", deal.fee);
    if (seller && sellerRow) credit({ club: seller, season: sellerRow }, "playerSales", deal.fee);
  }
  const type = fromCid === null ? "freeAgent" : "transfer";
  p.transfers.push({
    date: deal.date,
    season: deal.season,
    fromCid,
    toCid: buyer.cid,
    fee: deal.fee,
    type,
  });
  p.status = "club";
  p.cid = buyer.cid;
  p.loan = null;
  p.freeAgentSince = null;
  p.shirtNumber = freeShirtNumber(world.players, buyer.cid, p.position === "GK");
  // The seller's unamortised balance leaves with him; the buyer amortises the new fee.
  p.feeBalance = null;
  signContract(p, deal.wage, deal.expires, deal.date);
  const years = Math.max(1, yearsLeft(p, deal.date));
  p.feeBalance =
    deal.fee > 0 ? { remaining: deal.fee, perYear: Math.round(deal.fee / years) } : null;

  const log: TransferLog = { changed: new Set([p.pid]), transactions: [], messages: [] };
  const from = seller?.name ?? "free agency";
  log.transactions.push({
    season: deal.season,
    date: deal.date,
    type,
    pids: [p.pid],
    cids: fromCid === null ? [buyer.cid] : [fromCid, buyer.cid],
    names: [fullName(p), seller?.name ?? "", buyer.name],
    fee: deal.fee,
  });
  const terms = `${euros(deal.wage)} a year until ${deal.expires.slice(0, 4)}`;
  const fee = deal.fee > 0 ? ` for ${euros(deal.fee)}` : " on a free";
  if (buyer.cid === world.userCid) {
    log.messages.push({
      date: deal.date,
      season: deal.season,
      kind: "transfer",
      subject: `Signed ${fullName(p)}`,
      body: `${fullName(p)} (${p.position}, ${p.ovr}) joins from ${from}${fee}, on ${terms}.`,
      read: false,
    });
  } else if (fromCid !== null && fromCid === world.userCid) {
    log.messages.push({
      date: deal.date,
      season: deal.season,
      kind: "transfer",
      subject: `Sold ${fullName(p)}`,
      body: `${fullName(p)} (${p.position}, ${p.ovr}) leaves for ${buyer.name}${fee}.`,
      read: false,
    });
  }
  return log;
}
