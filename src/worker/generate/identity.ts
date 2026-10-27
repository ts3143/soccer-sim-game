/** Nationality, name and birthplace sampling for generated players. */
import { nationalitiesConfig } from "../../common/config/nationalities";
import type { WorldConfig } from "../../common/config/worlds";
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

/**
 * A club's nationality mix: its league's if the league has one (Classic's), else its
 * country's (the Super League's tiers, SPEC §17.3).
 */
export function clubMix(leagueId: string, country: string): Record<string, number> {
  const mix = nationalitiesConfig.leagueMix[leagueId] ?? nationalitiesConfig.countryMix[country];
  if (!mix) throw new Error(`No nationality mix for league ${leagueId} or country ${country}`);
  return mix;
}

const worldMixes = new WeakMap<WorldConfig, Record<string, number>>();

/**
 * A world's mixes added together, for free agents and second nationalities: each league's
 * mix in league order, or for a league without one its clubs' country mixes.
 */
export function worldMix(config: WorldConfig): Record<string, number> {
  let combined = worldMixes.get(config);
  if (!combined) {
    combined = {};
    for (const league of config.competitions.leagues) {
      const own = nationalitiesConfig.leagueMix[league.id];
      const mixes = own
        ? [own]
        : config.clubs
            .filter((c) => c.league === league.id)
            .map((c) => clubMix(c.league, c.country));
      for (const mix of mixes) {
        for (const [code, weight] of Object.entries(mix))
          combined[code] = (combined[code] ?? 0) + weight;
      }
    }
    worldMixes.set(config, combined);
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

/** `secondMix`: where a second nationality comes from (the world's mix, worldMix). */
export function sampleIdentity(
  rng: Random,
  nationality: string,
  secondMix: Record<string, number>,
): Identity {
  const file = nameFile(nationality);
  const nationality2 = rng.bool(nationalitiesConfig.dualNationalityChance)
    ? sampleNationality(rng, secondMix, nationality)
    : null;
  return {
    firstName: pickWeighted(rng, file.given),
    lastName: pickWeighted(rng, file.family),
    nationality,
    nationality2,
    birthplace: file.birthplaces.length > 0 ? pickWeighted(rng, file.birthplaces) : "",
  };
}
