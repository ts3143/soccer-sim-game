/** The new league screen (SPEC §11): every club the user can start as. */
import type { ClubChoice } from "../../common/api";
import { leagueById } from "../../common/config/competitions";
import { type WorldId, worldById } from "../../common/config/worlds";

export function getClubChoices(world: WorldId): ClubChoice[] {
  const { clubs, competitions } = worldById(world);
  return clubs.map((club, cid) => ({
    cid,
    code: club.code,
    name: club.name,
    short: club.short,
    abbr: club.abbr,
    leagueId: club.league,
    leagueName: leagueById(competitions, club.league).name,
    strength: club.strength,
    city: club.city,
    reputation: club.reputation,
    revenue: club.revenue,
    primaryColor: club.colors.primary,
  }));
}
