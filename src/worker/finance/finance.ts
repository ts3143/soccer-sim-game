/**
 * Club money (SPEC §6.2, §6.3): revenue streams, running costs and when cash moves.
 *
 * Revenue
 * - Matchday: attendance × ticket price at every home match (not at neutral finals).
 *   Attendance = capacity × fill; fill from the league's base, hype, market size, the
 *   opponent's reputation and the stage (early cup rounds draw less).
 * - Broadcast: the league's pool (config). The equal share is paid in ten instalments
 *   at the end of each month from August to May; the merit share is paid by final position
 *   (linear) when the season's matches end.
 * - Prize money: per cup round won, and for the beaten finalist (config), paid at once.
 * - Commercial: the club's commercial base × exp(slope × (reputation − base reputation)),
 *   in twelve monthly instalments. The base is set at league creation so season-1 revenue
 *   lands near the club's revenue anchor.
 * Running costs, at the end of each month: wages (a twelfth of the year's wage bill) and
 * the four budget dials (each costs a share of the season's budget base, rising with the
 * dial).
 *
 * Everything is whole euros, credited to the club's cash and its season row's breakdown.
 */
import { contractClub } from "../../common/status";
import { ffpCheck, type FfpResult } from "./ffp";
import { clubCap, luxuryTax, payroll, shareTax } from "./softCap";
import type { WorldConfig } from "../../common/config/worlds";
import { playoffId } from "../season/season";
import { addDays } from "../../common/dates";
import type { CompetitionsConfig, LeagueConfig } from "../../common/config/competitions";
import type { BudgetDials, Club, ClubSeason, Fixture, Player } from "../../common/schema";
import { startingConfidence } from "../club/board";
import { aiDials, setEffectiveDials } from "../club/standing";

/** Coefficients (provisional; tuned with the calibration harness). */
export const FINANCE = {
  /** Ticket price = league base × exp(slope × (reputation − 50)): ~€120 at reputation 90 in ENG1. */
  ticketReputationSlope: 0.033,
  attendance: {
    /** Fill change for hype 100 vs 50, market 100 vs 50, opponent reputation 100 vs 50. */
    hype: 0.25,
    market: 0.1,
    opponent: 0.05,
    /** Facilities 100 vs 50 (the slow-moving level that follows the Facilities dial). */
    facilities: 0.06,
    /** Early cup rounds draw this share of a league crowd; finals and semis a full one. */
    cupEarly: 0.75,
    min: 0.3,
    /**
     * Demand against the ticket price (SPEC §6.2), price / fair price to this power. The AI
     * charges the fair price, so only a user's own price moves it (M6). Above 1: dearer
     * tickets lose money unless the ground would be full anyway.
     */
    priceElasticity: 1.5,
  },
  commercial: {
    /** Per reputation point (fitted on the anchors: ~8% more per point). */
    reputationSlope: 0.078,
    /** Commercial base at least this share of the anchor. */
    floorShare: 0.05,
  },
  /** Each dial costs (base + perLevel × dial / 100) × the season's budget base. */
  dials: { base: 0.03, perLevel: 0.11 },
};

export type RevenueKind =
  "matchday" | "broadcast" | "merit" | "prize" | "commercial" | "playerSales" | "taxShare";
export type ExpenseKind = "wages" | keyof BudgetDials | "luxuryTax";

const leagueOf = (id: string, config: CompetitionsConfig): LeagueConfig => {
  const league = config.leagues.find((l) => l.id === id);
  if (!league) throw new Error(`Unknown league ${id}`);
  return league;
};

/** The AI's (fair) ticket price for a club; the user can set his own (M6). */
export function ticketPrice(reputation: number, league: LeagueConfig): number {
  return Math.round(
    league.finance.ticketPriceBase * Math.exp(FINANCE.ticketReputationSlope * (reputation - 50)),
  );
}

/** Spectators at a home match. */
export function attendance(
  club: Pick<Club, "capacity" | "market" | "facilitiesLevel">,
  hype: number,
  league: LeagueConfig,
  opponentReputation: number,
  stage = 1,
  priceRatio = 1,
): number {
  const a = FINANCE.attendance;
  const fill =
    league.finance.attendanceBase +
    (a.hype * (hype - 50)) / 50 +
    (a.market * (club.market - 50)) / 50 +
    (a.opponent * (opponentReputation - 50)) / 50 +
    (a.facilities * ((club.facilitiesLevel ?? 50) - 50)) / 50;
  const demand = fill * stage * Math.pow(priceRatio, -a.priceElasticity);
  return Math.round(club.capacity * Math.min(1, Math.max(a.min, demand)));
}

/** Expected season income from TV and home league gates, for setting the commercial base. */
export function expectedTvAndGates(
  club: Pick<Club, "capacity" | "market" | "leagueId">,
  reputation: number,
  hype: number,
  config: CompetitionsConfig,
): number {
  const league = leagueOf(club.leagueId, config);
  const tv = league.finance.broadcastPool / league.clubs;
  const homes = league.rounds / 2;
  return tv + homes * attendance(club, hype, league, 50) * ticketPrice(reputation, league);
}

/** Commercial base set from the revenue anchor (season 1 lands near the anchor). */
export function commercialBase(anchor: number, expectedTvGates: number): number {
  return Math.round(Math.max(FINANCE.commercial.floorShare * anchor, anchor - expectedTvGates));
}

/** A season's commercial income at the club's current reputation. */
export function seasonCommercial(club: Club, reputation: number): number {
  const c = club.commercial ?? { base: club.revenueAnchor * 0.3, reputation };
  return c.base * Math.exp(FINANCE.commercial.reputationSlope * (reputation - c.reputation));
}

/** A season's cost of one budget dial. */
export function dialCost(level: number, budgetBase: number): number {
  return (FINANCE.dials.base + (FINANCE.dials.perLevel * level) / 100) * budgetBase;
}

// ---------------------------------------------------------------------------
// The ledger

export interface ClubBooks {
  club: Club;
  season: ClubSeason;
}

export function credit(books: ClubBooks, kind: RevenueKind, amount: number): void {
  const euros = Math.round(amount);
  books.club.cash += euros;
  books.season.revenue[kind] = (books.season.revenue[kind] ?? 0) + euros;
}

/** Books an expense; `kind` is an ExpenseKind, or later kinds such as "transfers". */
export function debit(books: ClubBooks, kind: string, amount: number): void {
  const euros = Math.round(amount);
  books.club.cash -= euros;
  books.season.expenses[kind] = (books.season.expenses[kind] ?? 0) + euros;
}

export const totalOf = (record: Record<string, number>): number =>
  Object.values(record).reduce((sum, v) => sum + v, 0);

/** Revenue from running the club: everything but player sales (the next budget base). */
export const operatingRevenue = (revenue: Record<string, number>): number =>
  totalOf(revenue) - (revenue.playerSales ?? 0);

// ---------------------------------------------------------------------------
// When money moves

export interface FinanceWorld {
  /** The save's world: its switches decide the money rule and which dials cost money. */
  config: WorldConfig;
  clubs: readonly Club[];
  players: readonly Player[];
  /** This season's rows, by club. */
  clubSeasons: Map<number, ClubSeason>;
}

const books = (world: FinanceWorld, cid: number): ClubBooks | null => {
  const club = world.clubs.find((c) => c.cid === cid);
  const season = world.clubSeasons.get(cid);
  return club && season ? { club, season } : null;
};

/** Month-end dates in (from, to]: the last day of each month. */
export function monthEnds(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  for (;;) {
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const end = addDays(next, -1);
    if (end > to) break;
    if (end > from) out.push(end);
    [y, m] = next.split("-").map(Number) as [number, number];
  }
  return out;
}

/**
 * Month-end flows for every club for the month-ends in (from, to]: wages, dials,
 * commercial, the TV equal share (August–May), and a twelfth of each transfer fee's
 * yearly amortisation (non-cash: it lowers the player's balance and counts for FFP).
 * Returns the players whose fee balance changed.
 */
/**
 * Wages a club still owes a year for players it released (SPEC §7.6), as of `date`
 * (default: every one still on its list; month-end payments drop the finished ones).
 */
export function owedWages(club: Pick<Club, "released">, date = ""): number {
  return (club.released ?? []).reduce((sum, r) => (r.until >= date ? sum + r.wage : sum), 0);
}

/** Fee amortisation a club still carries a year for players it released. */
export function owedAmortisation(club: Pick<Club, "released">): number {
  return (club.released ?? []).reduce(
    (sum, r) => sum + (r.fee ? Math.min(r.fee.perYear, r.fee.remaining) : 0),
    0,
  );
}

export function settleMonths(
  world: FinanceWorld,
  from: string,
  to: string,
  config: CompetitionsConfig,
): Set<number> {
  const changed = new Set<number>();
  const ends = monthEnds(from, to);
  if (ends.length === 0) return changed;
  // No academies, no Youth dial to pay for (SPEC §17.4).
  const dials =
    world.config.switches.youth === "academy"
      ? (["coaching", "youth", "medical", "facilities"] as const)
      : (["coaching", "medical", "facilities"] as const);
  const wageBill = new Map<number, number>();
  for (const p of world.players) {
    if (p.cid !== null && p.contract && p.status === "club") {
      wageBill.set(p.cid, (wageBill.get(p.cid) ?? 0) + p.contract.wage);
    } else if (p.contract && p.status === "loan" && p.loan && p.cid !== null) {
      // A loanee's wage is split between the loan club and his parent club (SPEC §7.4).
      const loanPart = p.contract.wage * p.loan.wageShare;
      wageBill.set(p.cid, (wageBill.get(p.cid) ?? 0) + loanPart);
      const parent = p.loan.parentCid;
      wageBill.set(parent, (wageBill.get(parent) ?? 0) + p.contract.wage - loanPart);
    }
  }
  for (const end of ends) {
    const month = Number(end.slice(5, 7));
    const tvMonth = month >= 8 || month <= 5;
    for (const p of world.players) {
      const holder = contractClub(p);
      if (!p.feeBalance || p.feeBalance.remaining <= 0 || holder === null) continue;
      const row = world.clubSeasons.get(holder);
      if (!row) continue;
      const charge = Math.min(p.feeBalance.remaining, Math.round(p.feeBalance.perYear / 12));
      p.feeBalance = { ...p.feeBalance, remaining: p.feeBalance.remaining - charge };
      row.amortisation = (row.amortisation ?? 0) + charge;
      changed.add(p.pid);
    }
    // Released players' fees go on being amortised by the club that released them.
    for (const club of world.clubs) {
      const row = world.clubSeasons.get(club.cid);
      if (!row || !club.released) continue;
      for (const r of club.released) {
        if (!r.fee || r.fee.remaining <= 0) continue;
        const charge = Math.min(r.fee.remaining, Math.round(r.fee.perYear / 12));
        r.fee = { ...r.fee, remaining: r.fee.remaining - charge };
        row.amortisation = (row.amortisation ?? 0) + charge;
      }
    }
    for (const club of world.clubs) {
      const b = books(world, club.cid);
      if (!b) continue;
      const league = config.leagues.find((l) => l.id === b.season.leagueId);
      debit(b, "wages", ((wageBill.get(club.cid) ?? 0) + owedWages(club, end)) / 12);
      const base = b.season.budgetBase ?? club.revenueAnchor;
      for (const dial of dials) debit(b, dial, dialCost(club.budget[dial], base) / 12);
      credit(b, "commercial", seasonCommercial(club, b.season.reputation) / 12);
      if (league && tvMonth) {
        credit(
          b,
          "broadcast",
          (league.finance.broadcastPool * league.finance.equalShare) / league.clubs / 10,
        );
      }
    }
  }
  // Released players drop off once their old contracts have run out and their fees are paid.
  const last = ends[ends.length - 1] ?? to;
  const owing = (r: NonNullable<Club["released"]>[number]) =>
    r.until >= last || (r.fee?.remaining ?? 0) > 0;
  for (const club of world.clubs) {
    if (club.released?.some((r) => !owing(r))) club.released = club.released.filter(owing);
  }
  return changed;
}

/** Gate receipts for a played home match (none at neutral venues). */
export function matchdayIncome(
  world: FinanceWorld,
  fixture: Fixture,
  config: CompetitionsConfig,
): void {
  if (fixture.neutral) return;
  const home = books(world, fixture.homeCid);
  const away = world.clubSeasons.get(fixture.awayCid);
  if (!home) return;
  const league = config.leagues.find((l) => l.id === home.season.leagueId);
  if (!league) return;
  const cup = config.cups.find((c) => c.id === fixture.competition);
  const stage =
    cup && cup.rounds.indexOf(fixture.round) < cup.rounds.length - 2
      ? FINANCE.attendance.cupEarly
      : 1;
  const fair = ticketPrice(home.season.reputation, league);
  const crowd = attendance(
    home.club,
    home.season.hype,
    league,
    away?.reputation ?? 50,
    stage,
    home.club.ticketPrice / Math.max(1, fair),
  );
  credit(home, "matchday", crowd * home.club.ticketPrice);
}

/** Prize money for a decided cup tie: the winner's round prize, and the beaten finalist's. */
export function prizeIncome(
  world: FinanceWorld,
  fixture: Fixture,
  config: CompetitionsConfig,
): void {
  // A cup's prizes, or a play-off's (the Super League's: per round won, SPEC §17.7).
  const cup = config.cups.find((c) => c.id === fixture.competition);
  const playoff = config.leagues.find((l) => playoffId(l.id) === fixture.competition)?.playoff;
  const prizes = cup
    ? { rounds: cup.rounds, money: cup.prizeMoney }
    : playoff?.prizeMoney
      ? { rounds: playoff.rounds.map((r) => r.name), money: playoff.prizeMoney }
      : null;
  const winner = fixture.result?.winnerCid;
  if (!prizes || fixture.leg === 1 || winner === null || winner === undefined) return;
  const round = prizes.rounds.indexOf(fixture.round);
  const w = books(world, winner);
  if (w) credit(w, "prize", prizes.money.roundWon[round] ?? 0);
  if (round === prizes.rounds.length - 1) {
    const loser = books(world, winner === fixture.homeCid ? fixture.awayCid : fixture.homeCid);
    if (loser) credit(loser, "prize", prizes.money.runnerUp);
  }
}

/** TV merit money by final league position (linear: last place gets one share). */
export function meritIncome(
  world: FinanceWorld,
  leagueId: string,
  finalOrder: readonly number[],
  config: CompetitionsConfig,
): void {
  const league = config.leagues.find((l) => l.id === leagueId);
  if (!league) return;
  const pool = league.finance.broadcastPool * (1 - league.finance.equalShare);
  const n = finalOrder.length;
  const units = (n * (n + 1)) / 2;
  finalOrder.forEach((cid, i) => {
    const b = books(world, cid);
    if (b) credit(b, "merit", (pool * (n - i)) / units);
  });
}

// ---------------------------------------------------------------------------
// Season boundaries

/**
 * Closes a season's books on 30 June: the month-ends since `from`, each club's
 * season-end cash snapshot, then the FFP check (src/worker/finance/ffp.ts). Returns the
 * players whose fee balance changed and the user's FFP messages.
 */
/** The season's close: the FFP check's result, and the luxury tax paid and shared. */
export interface SeasonClose extends FfpResult {
  /** Per club: tax paid, and its share of its tier's tax (soft-cap worlds only). */
  tax: { paid: Map<number, number>; shared: Map<number, number> };
}

/**
 * 30 June: the season's last month-ends; under a soft cap the luxury tax, paid by clubs
 * over their cap and shared among their tier's clubs under it (SPEC §17.7); the cash
 * snapshot; and where the money rule is FFP, the FFP check.
 */
export function closeSeasonBooks(
  world: FinanceWorld,
  season: number,
  from: string,
  userCid: number,
  config: CompetitionsConfig,
): SeasonClose {
  const end = `${season + 1}-06-30`;
  const changed = settleMonths(world, from, end, config);
  const tax = { paid: new Map<number, number>(), shared: new Map<number, number>() };
  if (world.config.switches.moneyRule === "softCap") luxuryTaxes(world, season, end, config, tax);
  for (const club of world.clubs) {
    const row = world.clubSeasons.get(club.cid);
    if (row) row.cashEnd = club.cash;
  }
  const result =
    world.config.switches.moneyRule === "ffp"
      ? ffpCheck(world, season, userCid, config)
      : { changed: new Set<number>(), messages: [], breaches: [], bans: [] };
  for (const pid of changed) result.changed.add(pid);
  return { ...result, tax };
}

/** Each tier's luxury tax: paid by its clubs over their cap, shared by those under it. */
function luxuryTaxes(
  world: FinanceWorld,
  season: number,
  date: string,
  config: CompetitionsConfig,
  out: SeasonClose["tax"],
): void {
  const softCap = config.softCap;
  if (!softCap) return;
  for (const league of config.leagues) {
    let total = 0;
    const under: number[] = [];
    for (const club of world.clubs) {
      const b = books(world, club.cid);
      if (!b || b.season.leagueId !== league.id) continue;
      const cap = clubCap(config, { leagueId: league.id, capGrace: club.capGrace }, season);
      if (cap === null) continue;
      const owed = payroll(club, world.players, date);
      const tax = luxuryTax(softCap, owed, cap);
      if (tax > 0) {
        debit(b, "luxuryTax", tax);
        out.paid.set(club.cid, tax);
        total += tax;
      } else if (owed < cap) {
        under.push(club.cid);
      }
    }
    for (const [cid, share] of shareTax(total, under)) {
      const b = books(world, cid);
      if (b) credit(b, "taxShare", share);
      out.shared.set(cid, share);
    }
  }
}

/**
 * The next season's club rows: hype and reputation carried over, the club's new league,
 * last season's revenue as the budget base, and the board's starting confidence. Also
 * sets the AI clubs' ticket prices and budget dials for the new season.
 */
export function openSeasonBooks(
  clubs: readonly Club[],
  last: ReadonlyMap<number, ClubSeason>,
  season: number,
  userCid: number,
  config: CompetitionsConfig,
): Map<number, ClubSeason> {
  const out = new Map<number, ClubSeason>();
  for (const club of clubs) {
    const prev = last.get(club.cid);
    const revenue = prev ? operatingRevenue(prev.revenue) : 0;
    const reputation = prev?.reputation ?? 50;
    const budgetBase = revenue > 0 ? revenue : club.revenueAnchor;
    // The AI prices every club's tickets, except the user's when he has set his own (M6).
    const fixed = club.cid === userCid && club.ticketAuto === false;
    if (!fixed) club.ticketPrice = ticketPrice(reputation, leagueOf(club.leagueId, config));
    // The AI sets its dials each season; the user's club keeps the user's.
    if (club.cid !== userCid) club.budget = aiDials(club.cash, budgetBase);
    out.set(club.cid, {
      cid: club.cid,
      season,
      leagueId: club.leagueId,
      hype: prev?.hype ?? 50,
      reputation,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      finish: null,
      revenue: {},
      expenses: {},
      cashEnd: null,
      boardExpectation: null,
      boardConfidence: null,
      squadCostRatio: null,
      budgetBase,
      boardStart: startingConfidence(prev?.boardConfidence),
    });
  }
  // What the dials do is relative to the average club (ZenGM-style expense levels).
  setEffectiveDials(clubs);
  return out;
}
