/**
 * The contract year (SPEC §3.1, §7.6), replacing M3's rollover:
 * - 1 July: contracts that ended on 30 June expire; those players become free agents.
 * - Renewals only in the windows. The AI renews the players it wants when the summer
 *   window opens (final year, or two years left for regulars) and, last chance, when the
 *   winter window opens (final year). It never acts for the user's club (T, 2026-10-16).
 * - The user's inbox: a list of his players in their final six months when the winter
 *   window opens, a reminder the day before deadline day, and who left on 1 July.
 */
import { exactAge } from "../../common/dates";
import type { Club, ClubSeason, InboxMessage, Player, TransactionRow } from "../../common/schema";
import { clubStrength } from "../club/standing";
import {
  contractAsks,
  contractEnd,
  type Mood,
  playerMood,
  preferredYears,
  signContract,
  yearsLeft,
} from "./market";

export const RENEWALS = {
  /** AI keeps players in its best `keepTop` by OVR, or young prospects near its level. */
  keepTop: 18,
  keepTopRegulars: 11,
  prospectAge: 23,
  prospectPotBelowXi: 3,
  /** Players this old get at most a one-year deal, and only if among the best `oldTop`. */
  oldAge: 32,
  oldTop: 14,
  /**
   * Wage bill the AI allows after a renewal, as a share of its budget base. Its best
   * `keepTopRegulars` are re-signed whatever the bill (as ZenGM lets teams re-sign their
   * own players over the cap); without that, weaker clubs lost regulars and parity fell.
   */
  wageBudget: 0.55,
};

export interface ContractWorld {
  clubs: readonly Club[];
  players: Player[];
  clubSeasons: ReadonlyMap<number, ClubSeason>;
  userCid: number;
}

export interface ContractLog {
  changed: Set<number>;
  transactions: Omit<TransactionRow, "xid">[];
  messages: Omit<InboxMessage, "mid">[];
}

const emptyLog = (): ContractLog => ({ changed: new Set(), transactions: [], messages: [] });
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const seasonLabel = (season: number) => `${season}/${String((season + 1) % 100).padStart(2, "0")}`;

/** Seasons a player has been at his club (since his last move there, or since he appeared). */
function yearsAtClub(p: Player, date: string): number {
  const joined =
    [...p.transfers].reverse().find((t) => t.toCid === p.cid)?.date ??
    p.ratingsHistory[0]?.date ??
    date;
  return Math.max(0, exactAge(joined, date));
}

/** Every club's best-XI OVR and the strongest, for ambition (SPEC §4.6). */
export function clubLevels(world: ContractWorld, date: string) {
  const byClub = new Map(world.clubs.map((c) => [c.cid, clubStrength(world.players, c.cid, date)]));
  return { byClub, top: Math.max(0, ...byClub.values()) };
}

/** His mood toward his current club (`levels` from clubLevels, if already known). */
export function moodAtClub(
  world: ContractWorld,
  p: Player,
  date: string,
  levels: ReturnType<typeof clubLevels> = clubLevels(world, date),
): Mood | null {
  const club = world.clubs.find((c) => c.cid === p.cid);
  const season = club ? world.clubSeasons.get(club.cid) : undefined;
  if (!club || !season) return null;
  const games = season.won + season.drawn + season.lost;
  const minutes = p.devTally?.seasonMinutes ?? 0;
  return playerMood(p, {
    club,
    season,
    success: season.boardConfidence ?? 50,
    minutesShare: games > 0 ? minutes / (games * 90) : 0.4,
    yearsAtClub: yearsAtClub(p, date),
    levels: { club: levels.byClub.get(club.cid) ?? 0, top: levels.top, date },
  });
}

/** The club's revenue scale for wages: its budget base (last season's revenue). */
export const clubRevenue = (world: ContractWorld, club: Club): number =>
  world.clubSeasons.get(club.cid)?.budgetBase ?? club.revenueAnchor;

/** 1 July: contracts that ended on 30 June expire; the players become free agents. */
export function expireContracts(world: ContractWorld, season: number, date: string): ContractLog {
  const log = emptyLog();
  const ended = `${season}-06-30`;
  const leftUser: string[] = [];
  for (const p of world.players) {
    if (p.status !== "club" || !p.contract || p.contract.expires > ended) continue;
    const club = world.clubs.find((c) => c.cid === p.cid);
    const cid = p.cid as number;
    p.transfers.push({ date, season, fromCid: cid, toCid: null, fee: 0, type: "release" });
    p.status = "freeAgent";
    p.cid = null;
    p.contract = null;
    p.loan = null;
    p.shirtNumber = null;
    p.freeAgentSince = date;
    p.feeBalance = null;
    log.changed.add(p.pid);
    log.transactions.push({
      season,
      date,
      type: "release",
      pids: [p.pid],
      cids: [cid],
      names: [fullName(p), `${club?.name ?? ""} (contract ended)`],
      fee: 0,
    });
    if (cid === world.userCid) leftUser.push(fullName(p));
  }
  if (leftUser.length > 0) {
    log.messages.push({
      date,
      season,
      kind: "contracts",
      subject: `${leftUser.length} player(s) left at the end of their contracts`,
      body: `Free agents now: ${leftUser.join(", ")}.`,
      read: false,
    });
  }
  return log;
}

/** The AI's renewals when a window opens. Summer: final year, or two years left for regulars. */
export function aiRenewals(
  world: ContractWorld,
  season: number,
  date: string,
  window: "summer" | "winter",
): ContractLog {
  const log = emptyLog();
  const r = RENEWALS;
  const levels = clubLevels(world, date);
  for (const club of world.clubs) {
    if (club.cid === world.userCid) continue;
    const squad = world.players
      .filter((p) => p.cid === club.cid && p.status === "club")
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    const rank = new Map(squad.map((p, i) => [p.pid, i]));
    const xi =
      squad.slice(0, 11).reduce((s, p) => s + p.ovr, 0) / Math.max(1, Math.min(11, squad.length));
    const revenue = clubRevenue(world, club);
    let wageBill = squad.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
    for (const p of squad) {
      const left = yearsLeft(p, date);
      const place = rank.get(p.pid) ?? 99;
      const due = left === 1 || (window === "summer" && left === 2 && place < r.keepTopRegulars);
      if (!due) continue;
      const age = exactAge(p.birthDate, date);
      const prospect = age <= r.prospectAge && p.pot >= xi - r.prospectPotBelowXi;
      const old = age >= r.oldAge;
      const wanted = old ? place < r.oldTop : place < r.keepTop || prospect;
      if (!wanted) continue;
      const mood = moodAtClub(world, p, date, levels);
      if (!mood?.willing) continue;
      // His preferred length, or the shortest that runs past his current contract.
      let years = old ? 1 : Math.min(5, preferredYears(age));
      while (years < 5 && contractEnd(season, years, date) <= (p.contract?.expires ?? "")) years++;
      const expires = contractEnd(season, years, date);
      const ask = contractAsks(p, date, revenue, mood.value, left === 1).find(
        (a) => a.years === years,
      );
      if (!ask || expires <= (p.contract?.expires ?? "")) continue;
      const raise = ask.wage - (p.contract?.wage ?? 0);
      const core = place < r.keepTopRegulars;
      if (!core && raise > 0 && wageBill + raise > r.wageBudget * revenue) continue;
      wageBill += raise;
      signContract(p, ask.wage, expires, date);
      log.changed.add(p.pid);
      log.transactions.push({
        season,
        date,
        type: "renewal",
        pids: [p.pid],
        cids: [club.cid],
        names: [fullName(p), club.name],
        fee: 0,
      });
    }
  }
  return log;
}

/** The user's players whose contracts end this 30 June. */
export const expiringForUser = (world: ContractWorld, date: string): Player[] =>
  world.players.filter(
    (p) => p.cid === world.userCid && p.status === "club" && yearsLeft(p, date) === 1,
  );

/** Inbox: the January list of final-year players, or the reminder before deadline day. */
export function contractWarning(
  world: ContractWorld,
  season: number,
  date: string,
  reminder: boolean,
): Omit<InboxMessage, "mid"> | null {
  const expiring = expiringForUser(world, date);
  if (expiring.length === 0) return null;
  const names = expiring.map((p) => `${fullName(p)} (${p.position}, ${p.ovr})`).join(", ");
  return {
    date,
    season,
    kind: "contracts",
    subject: reminder
      ? `Deadline day tomorrow: ${expiring.length} contract(s) still to renew`
      : `${expiring.length} contract(s) end in June`,
    body: reminder
      ? `Renew by 31 January or they leave on 1 July: ${names}.`
      : `These players are in their final six months (${seasonLabel(season)}). Renew them in this window or they leave on 1 July: ${names}.`,
    read: false,
  };
}
