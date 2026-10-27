/**
 * The soft cap (SPEC §17.7; the Super League's money rule): a club's payroll, its cap (its
 * tier's, or a relegated club's old tier's through its grace seasons), what a club over the
 * cap may still do, and the luxury tax with its sharing. Pure rules: the season applies
 * them (SL3).
 */
import {
  capOf,
  type CompetitionsConfig,
  type SoftCapConfig,
} from "../../common/config/competitions";
import type { Club, Player } from "../../common/schema";
import { contractClub } from "../../common/status";
import type { ClubMove } from "../season/season";
import { owedWages } from "./finance";

/**
 * Wages of the players under contract with the club, plus those it still owes released
 * players (as of `date`: a finished one no longer counts). No fees: nothing is amortised.
 */
export function payroll(
  club: Pick<Club, "cid" | "released">,
  players: readonly Player[],
  date = "",
): number {
  let total = owedWages(club, date);
  for (const p of players) {
    if (p.contract && contractClub(p) === club.cid) total += p.contract.wage;
  }
  return total;
}

/**
 * The club's cap in `season`: its league's, or while a relegated club's grace lasts its
 * old league's (whichever is higher). Null in a world without a cap.
 */
export function clubCap(
  config: CompetitionsConfig,
  club: Pick<Club, "leagueId" | "capGrace">,
  season: number,
): number | null {
  const own = capOf(config, club.leagueId);
  const grace = club.capGrace;
  if (own === null || !grace || season > grace.through) return own;
  return Math.max(own, capOf(config, grace.leagueId) ?? own);
}

/** The grace a club relegated after `season` gets: its old league's cap, for a while. */
export function relegationGrace(
  softCap: SoftCapConfig,
  from: string,
  season: number,
): NonNullable<Club["capGrace"]> {
  return { leagueId: from, through: season + softCap.graceSeasons };
}

/** Relegated clubs keep their old tier's cap for their grace (a world with a cap only). */
export function applyCapGrace(
  clubs: Club[],
  moves: readonly ClubMove[],
  config: CompetitionsConfig,
  season: number,
): void {
  const softCap = config.softCap;
  if (!softCap) return;
  for (const move of moves) {
    const club = clubs.find((c) => c.cid === move.cid);
    if (club && move.reason === "relegated") {
      club.capGrace = relegationGrace(softCap, move.from, season);
    }
  }
}

/** Over the cap, a free agent can still be signed at the minimum wage. */
export function canSignFreeAgent(
  softCap: SoftCapConfig,
  payrollNow: number,
  cap: number,
  wage: number,
): boolean {
  return payrollNow + wage <= cap || wage <= softCap.minimumWage;
}

/**
 * A trade fits a club's cap if its payroll ends under the cap, or if the wages it takes
 * back are at most `tradeMatching` times those it sends out.
 */
export function tradeFits(
  softCap: SoftCapConfig,
  payrollNow: number,
  cap: number,
  wagesOut: number,
  wagesIn: number,
): boolean {
  return payrollNow - wagesOut + wagesIn <= cap || wagesIn <= softCap.tradeMatching * wagesOut;
}

/** The luxury tax on a season-end payroll: the rate times the part above the cap. */
export function luxuryTax(softCap: SoftCapConfig, payrollAtEnd: number, cap: number): number {
  return Math.max(0, Math.round((payrollAtEnd - cap) * softCap.luxuryTaxRate));
}

/**
 * A tier's tax shared equally among its clubs under the cap (whole euros; the first in
 * `receivers` get the remainder). Nothing is shared if no club is under the cap.
 */
export function shareTax(total: number, receivers: readonly number[]): Map<number, number> {
  const shares = new Map<number, number>();
  if (receivers.length === 0 || total <= 0) return shares;
  const each = Math.floor(total / receivers.length);
  const left = total - each * receivers.length;
  receivers.forEach((cid, i) => shares.set(cid, each + (i < left ? 1 : 0)));
  return shares;
}
