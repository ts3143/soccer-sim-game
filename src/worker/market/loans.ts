/**
 * Loans (SPEC §7.4), within the simulated clubs. Season-long, or half a season (summer to
 * 1 January, or January to the season's end); the loan club pays 0, 50 or 100% of the
 * wage and the parent the rest; no recall, no option to buy. The loanee plays, trains and
 * develops at the loan club (its coaching, his minutes there) and can't face his parent
 * club. His contract, renewals and transfer value stay with the parent.
 *
 * The AI lists young prospects who won't get minutes (21 or under, outside its best 16,
 * POT within 8 of its XI level) and takes one on loan when he'd fill a need (aiMarket).
 * An AI club lends for half the wage and borrows for at most half (or all of it for a
 * player who'd start). It never lends or borrows for the user's club; the user proposes
 * loans himself (src/worker/league/market.ts).
 */
import { exactAge, formatDay } from "../../common/dates";
import { transferBanned } from "../finance/ffp";
import type { Club, Player } from "../../common/schema";
import { freeShirtNumber, type MarketSnapshot, seniorsOf, type TransferLog } from "./transfers";
import type { ContractWorld } from "./renewals";

export const LOANS = {
  /** The AI lists players this young who rank outside its best `fromRank`… */
  maxAge: 21,
  fromRank: 16,
  /** …and are prospects: POT at least the parent's XI level less this. */
  potBelowXi: 8,
  /** A parent keeps at least this many seniors after lending. */
  parentKeeps: 20,
  /** Loanees a club may have in, and out, at once. */
  maxIn: 2,
  maxOut: 4,
  /** A borrower takes a player who'd rank in its best this-many (he must play). */
  playsIfRankBelow: 14,
  /** The loan club's wage share in AI deals. */
  aiWageShare: 0.5,
  /** The user may borrow players up to this age. */
  userMaxAge: 23,
  /**
   * Placements: an AI club with listed prospects tries to place one per market day with
   * a club whose XI level is within this range of his OVR (so he plays at his level) and
   * where he'd rank in its best 14.
   */
  placeLevel: { below: 4, above: 6 },
};

export type LoanLength = "half" | "season";

/** When a loan from `date` ends: half (from the summer) to 1 January, else 30 June. */
export function loanEnd(season: number, date: string, length: LoanLength): string {
  const summer = Number(date.slice(5, 7)) >= 7;
  return length === "half" && summer ? `${season + 1}-01-01` : `${season + 1}-06-30`;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const nameOf = (world: ContractWorld, cid: number) =>
  world.clubs.find((c) => c.cid === cid)?.name ?? "?";

export const loansIn = (players: readonly Player[], cid: number) =>
  players.filter((p) => p.status === "loan" && p.cid === cid).length;
export const loansOut = (players: readonly Player[], cid: number) =>
  players.filter((p) => p.status === "loan" && p.loan?.parentCid === cid).length;

/** Where he'd rank by OVR in a club's squad if he joined (0 = its best). */
export const rankAt = (squad: readonly Player[], p: Player) =>
  squad.filter((x) => x.pid !== p.pid && x.ovr > p.ovr).length;

/**
 * Would the parent lend him? Young, outside its best 16, a prospect, and it keeps 20
 * seniors. `maxAge` is the AI's 21 by default (the user may ask for players up to 23).
 */
export function lendable(
  world: ContractWorld,
  p: Player,
  date: string,
  snap?: MarketSnapshot,
  maxAge: number = LOANS.maxAge,
  outCount?: number,
): boolean {
  if (p.status !== "club" || p.cid === null || p.loan) return false;
  const squad = snap?.seniors.get(p.cid) ?? seniorsOf(world.players, p.cid);
  const out = outCount ?? loansOut(world.players, p.cid);
  if (squad.length <= LOANS.parentKeeps || out >= LOANS.maxOut) return false;
  const rank = squad.findIndex((x) => x.pid === p.pid);
  const xi =
    squad.slice(0, 11).reduce((s, x) => s + x.ovr, 0) / Math.max(1, Math.min(11, squad.length));
  return (
    exactAge(p.birthDate, date) <= maxAge &&
    rank >= LOANS.fromRank &&
    p.pot >= xi - LOANS.potBelowXi
  );
}

/** Loanees in, per club. */
export function loansInByClub(players: readonly Player[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of players)
    if (p.status === "loan" && p.cid !== null) out.set(p.cid, (out.get(p.cid) ?? 0) + 1);
  return out;
}

/** Every player AI clubs would lend now (never the user's: he decides his own). */
export function loanList(world: ContractWorld, date: string, snap: MarketSnapshot): Player[] {
  const out = new Map<number, number>();
  for (const p of world.players) {
    if (p.status === "loan" && p.loan)
      out.set(p.loan.parentCid, (out.get(p.loan.parentCid) ?? 0) + 1);
  }
  return world.players.filter(
    (p) =>
      p.status === "club" &&
      p.cid !== world.userCid &&
      lendable(world, p, date, snap, LOANS.maxAge, out.get(p.cid as number) ?? 0),
  );
}

export interface LoanDeal {
  pid: number;
  toCid: number;
  until: string;
  /** The loan club's share of his wage (0, 0.5 or 1). */
  wageShare: number;
  date: string;
  season: number;
}

/** Sends a player on loan. */
export function startLoan(world: ContractWorld, deal: LoanDeal): TransferLog {
  const p = world.players.find((x) => x.pid === deal.pid);
  if (!p || p.status !== "club" || p.cid === null) {
    throw new Error(`Player ${deal.pid} can't go on loan`);
  }
  const parent = p.cid;
  const loanClub = world.clubs.find((c) => c.cid === deal.toCid) as Club;
  p.transfers.push({
    date: deal.date,
    season: deal.season,
    fromCid: parent,
    toCid: loanClub.cid,
    fee: 0,
    type: "loan",
  });
  p.status = "loan";
  p.loan = { parentCid: parent, until: deal.until, wageShare: deal.wageShare };
  p.cid = loanClub.cid;
  p.shirtNumber = freeShirtNumber(world.players, loanClub.cid, p.position === "GK");
  const log: TransferLog = { changed: new Set([p.pid]), transactions: [], messages: [] };
  log.transactions.push({
    season: deal.season,
    date: deal.date,
    type: "loan",
    pids: [p.pid],
    cids: [parent, loanClub.cid],
    names: [fullName(p), nameOf(world, parent), loanClub.name],
    fee: 0,
  });
  const terms = `until ${formatDay(deal.until)}, ${loanClub.name} paying ${Math.round(deal.wageShare * 100)}% of his wage`;
  if (parent === world.userCid) {
    log.messages.push({
      date: deal.date,
      season: deal.season,
      kind: "transfer",
      subject: `${fullName(p)} goes on loan`,
      body: `${fullName(p)} joins ${loanClub.name} on loan ${terms}.`,
      players: [{ pid: p.pid, name: fullName(p) }],
      read: false,
    });
  } else if (loanClub.cid === world.userCid) {
    log.messages.push({
      date: deal.date,
      season: deal.season,
      kind: "transfer",
      subject: `${fullName(p)} joins on loan`,
      body: `${fullName(p)} (${p.position}, ${p.ovr}) joins from ${nameOf(world, parent)} on loan ${terms}.`,
      players: [{ pid: p.pid, name: fullName(p) }],
      read: false,
    });
  }
  return log;
}

/** Loans ending on or before `date` return to their parent clubs. */
export function returnLoans(world: ContractWorld, date: string, season: number): TransferLog {
  const log: TransferLog = { changed: new Set(), transactions: [], messages: [] };
  const back: string[] = [];
  const backRefs: { pid: number; name: string }[] = [];
  for (const p of world.players) {
    if (p.status !== "loan" || !p.loan || p.loan.until > date) continue;
    const from = p.cid as number;
    const parent = p.loan.parentCid;
    p.transfers.push({ date, season, fromCid: from, toCid: parent, fee: 0, type: "loan" });
    p.status = "club";
    p.cid = parent;
    p.loan = null;
    p.shirtNumber = freeShirtNumber(world.players, parent, p.position === "GK");
    log.changed.add(p.pid);
    if (parent === world.userCid) {
      back.push(`${fullName(p)} (${nameOf(world, from)})`);
      backRefs.push({ pid: p.pid, name: fullName(p) });
    }
  }
  if (back.length > 0) {
    log.messages.push({
      date,
      season,
      kind: "transfer",
      subject: `${back.length} player(s) back from loan`,
      body: `Back in your squad: ${back.join(", ")}.`,
      players: backRefs,
      read: false,
    });
  }
  return log;
}

/**
 * A home for a listed prospect: the club (not his own, not the user's) at about his level
 * where he'd rank highest, with room for a loanee. Its wage share: half if it has the wage
 * room, otherwise none (his parent pays, to get him minutes).
 */
export function loanHome(
  world: ContractWorld,
  p: Player,
  snap: MarketSnapshot,
  wageRoom: (club: Club) => number,
  inCount: ReadonlyMap<number, number>,
): { club: Club; wageShare: number } | null {
  const l = LOANS.placeLevel;
  let best: { club: Club; wageShare: number; rank: number } | null = null;
  for (const club of world.clubs) {
    if (club.cid === p.cid || club.cid === world.userCid || transferBanned(club, snap.date))
      continue;
    const level = snap.levels.byClub.get(club.cid) ?? 0;
    if (level < p.ovr - l.below || level > p.ovr + l.above) continue;
    const squad = snap.seniors.get(club.cid) ?? [];
    if (squad.length >= 25 || (inCount.get(club.cid) ?? 0) >= LOANS.maxIn) continue;
    const rank = rankAt(squad, p);
    if (rank >= LOANS.playsIfRankBelow || (best && rank >= best.rank)) continue;
    const wageShare =
      (p.contract?.wage ?? 0) * LOANS.aiWageShare <= wageRoom(club) ? LOANS.aiWageShare : 0;
    best = { club, wageShare, rank };
  }
  return best && { club: best.club, wageShare: best.wageShare };
}
