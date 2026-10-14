/** Nationality, name and birthplace sampling for generated players. */
import { nationalitiesConfig } from "../../common/config/nationalities";
import type { Random } from "../core/random";
import { nameFiles, type NameFile, type WeightedLabel } from "./nameData";

const pickWeighted = (rng: Random, list: readonly WeightedLabel[]): string =>
  rng.weighted(list, ([, weight]) => weight)[0];

function nameFile(nationality: string): NameFile {
  const file = nameFiles[nationality];
  if (!file || file.given.length === 0 || file.family.length === 0) {
    throw new Error(`No name data for nationality ${nationality}`);
  }
  return file;
}

/** Samples a nationality from a weight table (percent weights, normalised here). */
export function sampleNationality(
  rng: Random,
  mix: Record<string, number>,
  exclude?: string,
): string {
  const entries = Object.entries(mix).filter(([code]) => code !== exclude);
  return rng.weighted(entries, ([, weight]) => weight)[0];
}

let combined: Record<string, number> | undefined;

/** Weighted mix of all leagues together (for free agents and second nationalities). */
export function combinedMix(): Record<string, number> {
  if (!combined) {
    combined = {};
    for (const mix of Object.values(nationalitiesConfig.leagueMix)) {
      for (const [code, weight] of Object.entries(mix))
        combined[code] = (combined[code] ?? 0) + weight;
    }
  }
  return combined;
}

/**
 * Youth intake nationality: the club's country at `homeShare` (linear in reputation,
 * from 0.85 at small clubs to 0.6 at big ones), otherwise the league mix minus home.
 */
export function sampleYouthNationality(
  rng: Random,
  clubCountry: string,
  reputation: number,
  leagueMix: Record<string, number>,
): string {
  const y = nationalitiesConfig.youthIntake;
  const t = Math.min(
    1,
    Math.max(
      0,
      (reputation - y.smallClubReputation) / (y.bigClubReputation - y.smallClubReputation),
    ),
  );
  const homeShare = y.homeShareSmallClub + (y.homeShareBigClub - y.homeShareSmallClub) * t;
  return rng.bool(homeShare) ? clubCountry : sampleNationality(rng, leagueMix, clubCountry);
}

export interface Identity {
  firstName: string;
  lastName: string;
  nationality: string;
  nationality2: string | null;
  birthplace: string;
}

export function sampleIdentity(rng: Random, nationality: string): Identity {
  const file = nameFile(nationality);
  const nationality2 = rng.bool(nationalitiesConfig.dualNationalityChance)
    ? sampleNationality(rng, combinedMix(), nationality)
    : null;
  return {
    firstName: pickWeighted(rng, file.given),
    lastName: pickWeighted(rng, file.family),
    nationality,
    nationality2,
    birthplace: file.birthplaces.length > 0 ? pickWeighted(rng, file.birthplaces) : "",
  };
}
