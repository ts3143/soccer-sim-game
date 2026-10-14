/** Nationality mixes and preferred-foot rules (data/config/nationalities.json). */
import raw from "../../../data/config/nationalities.json";
import type { Side } from "./ratings";

export interface NationalitiesConfig {
  /** Percent weights per nationality code, per league (normalised when sampling). */
  leagueMix: Record<string, Record<string, number>>;
  youthIntake: {
    homeShareSmallClub: number;
    homeShareBigClub: number;
    /** Reputation at or below which a club counts as small, and at or above which big. */
    smallClubReputation: number;
    bigClubReputation: number;
  };
  dualNationalityChance: number;
  preferredFoot: { rightShare: number; leftShareBySlotSide: Record<Side, number> };
}

export const nationalitiesConfig: NationalitiesConfig = {
  leagueMix: raw.leagueMix,
  youthIntake: {
    homeShareSmallClub: raw.youthIntake.homeShareSmallClub,
    homeShareBigClub: raw.youthIntake.homeShareBigClub,
    // From the config note: "Linear by reputation between small (rep <= 40) and big (rep >= 85)."
    smallClubReputation: 40,
    bigClubReputation: 85,
  },
  dualNationalityChance: raw.dualNationalityChance,
  preferredFoot: raw.preferredFoot,
};

/** Every nationality code that appears in any league mix. */
export const ALL_NATIONALITIES: readonly string[] = [
  ...new Set(Object.values(raw.leagueMix).flatMap((mix) => Object.keys(mix))),
].sort();
