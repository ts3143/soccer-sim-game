/**
 * Academy players (SPEC §7.2): one generator for the opening academies (M1) and every
 * summer's youth intake (M3), so both draw from the same quality and nationality rules.
 */
import { nationalitiesConfig } from "../../common/config/nationalities";
import { ratingsConfig, type Position, type Side } from "../../common/config/ratings";
import type { Player } from "../../common/schema";
import type { Random } from "../core/random";
import { sampleYouthNationality } from "./identity";
import { capCeiling, generatePlayer } from "./player";

export const ACADEMY_POSITIONS: [Position, number][] = [
  ["GK", 10], ["CB", 18], ["FB", 12], ["WB", 4], ["DM", 8],
  ["CM", 14], ["WM", 6], ["AM", 8], ["W", 10], ["ST", 10],
]; // prettier-ignore

/**
 * Target OVR of an academy player:
 *   base + perReputation × reputation + perYear × (age − 16) + perYouthDial × (dial − 50) + noise
 * clamped to [min, max] (and, in the opening squads, below the club's strength − 3).
 * Tuned in M3 with the calibration harness (wonderkids per league, long-run quality).
 */
export const YOUTH_QUALITY = {
  base: 25,
  perReputation: 0.22,
  perYear: 4.5,
  perYouthDial: 0.06,
  sd: 5,
  min: 25,
  max: 60,
  /**
   * Talent: extra ceiling headroom per standard deviation a youth's quality is above the
   * expected level for his club and age. The best youngsters, who earn minutes first, are
   * also the ones with most room to grow.
   */
  talentHeadroom: 2,
};

export interface AcademyClub {
  cid: number;
  country: string;
  leagueId: string;
  reputation: number;
  youthDial: number;
  /** Optional cap on quality (opening squads: the club's strength − 3). */
  maxQuality?: number;
}

export function generateAcademyPlayer(
  rng: Random,
  club: AcademyClub,
  age: number,
  pid: number,
  season: number,
  seasonStart: string,
): Player {
  const q = YOUTH_QUALITY;
  const position = rng.weighted(ACADEMY_POSITIONS, ([, w]) => w)[0];
  const side: Side = ratingsConfig.sidedPositions.includes(position)
    ? rng.choice(["L", "R"] as const)
    : "C";
  const talent = rng.normal(0, 1);
  const raw =
    q.base +
    q.perReputation * club.reputation +
    q.perYear * (age - 16) +
    q.perYouthDial * (club.youthDial - 50) +
    talent * q.sd;
  const quality = Math.min(club.maxQuality ?? q.max, q.max, Math.max(q.min, raw));
  const leagueMix = nationalitiesConfig.leagueMix[club.leagueId] ?? {};
  const player = generatePlayer(
    rng,
    {
      position,
      side,
      quality,
      age,
      nationality: sampleYouthNationality(rng, club.country, club.reputation, leagueMix),
      status: "academy",
      cid: club.cid,
    },
    pid,
    season,
    seasonStart,
  );
  if (q.talentHeadroom !== 0) {
    player.hidden.ceiling = capCeiling(
      player.hidden.ceiling + talent * q.talentHeadroom,
      player.ovr,
    );
  }
  return player;
}
