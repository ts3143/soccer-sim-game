/** A club's payroll against its soft cap (SPEC §17.7), as the pages show it. */
import type { CapView } from "../../common/api";
import { leagueById } from "../../common/config/competitions";
import type { Club, Player } from "../../common/schema";
import { clubCap, freeAgentWageRoom, luxuryTax, payroll } from "../finance/softCap";
import type { LeagueSession } from "../league/session";

/** Club `club`'s cap view on `date` of `season`; null in a world without a cap. */
export function capView(
  session: LeagueSession,
  club: Club,
  players: readonly Player[],
  season: number,
  date: string,
): CapView | null {
  const competitions = session.config.competitions;
  const softCap = competitions.softCap;
  const cap = clubCap(competitions, club, season);
  if (!softCap || cap === null) return null;
  const owed = payroll(club, players, date);
  const grace = club.capGrace && season <= club.capGrace.through ? club.capGrace : null;
  return {
    payroll: owed,
    cap,
    room: cap - owed,
    minimumWage: softCap.minimumWage,
    freeAgentRoom: freeAgentWageRoom(softCap, owed, cap),
    taxIfEnded: luxuryTax(softCap, owed, cap),
    taxRate: softCap.luxuryTaxRate,
    tradeMatching: softCap.tradeMatching,
    grace: grace
      ? { league: leagueById(competitions, grace.leagueId).name, through: grace.through }
      : null,
  };
}
