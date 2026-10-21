/** The new league screen (SPEC §11): every club the user can start as. */
import type { ClubChoice } from "../../common/api";
import { clubDefinitions } from "../../common/config/clubs";
import { leagueById } from "../../common/config/competitions";

export function getClubChoices(): ClubChoice[] {
  return clubDefinitions.map((club, cid) => ({
    cid,
    code: club.code,
    name: club.name,
    leagueId: club.league,
    leagueName: leagueById(club.league).name,
    strength: club.strength,
    city: club.city,
    reputation: club.reputation,
    revenue: club.revenue,
    primaryColor: club.colors.primary,
  }));
}
