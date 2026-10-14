/**
 * Pre-match tactics for teams the AI manages (SPEC §8.3: "AI clubs choose formation and
 * sliders to suit their squad"). The formation is the club's own; the sliders are picked
 * against this opponent:
 *   mentality   attacking when clearly stronger (home counts a little), defensive when weaker
 *   pressing    from the squad's legs: pressing quality relative to its passing
 *   directness  from the squad's profile (long-ball outlet vs short passing), nudged by
 *               the league's style (ENG2 plays more direct)
 * M3 adds fixture importance and rotation.
 */
import { formationById } from "../../common/config/formations";
import { RATING_INDEX as R } from "../../common/config/ratings";
import type { SliderSettings } from "../../common/schema";
import { COEFFICIENTS, type Coefficients } from "./coefficients";
import {
  computeTeamRatings,
  effectiveRatings,
  formationPlan,
  type TeamRatings,
} from "./teamRatings";
import type { EngineTeamInput } from "./types";

const NEUTRAL: SliderSettings = { mentality: 0, pressing: 0, directness: 0 };
const clampStep = (x: number) => Math.max(-2, Math.min(2, Math.round(x)));

export interface Profile {
  ratings: TeamRatings;
  longBall: number;
  overall: number;
}

/** A team's pre-match ratings (fresh, at kick-off condition) with the given sliders. */
export function teamProfile(
  team: EngineTeamInput,
  c: Coefficients = COEFFICIENTS,
  sliders: SliderSettings = NEUTRAL,
): Profile {
  const formation = formationById(team.formation);
  const byPid = new Map(team.players.map((p) => [p.pid, p]));
  const starters = team.lineup.map((pid) => byPid.get(pid));
  const eff = starters.map((p) => (p ? effectiveRatings(p.ratings, p.condition / 100, c) : null));
  const taker = eff.reduce<number[] | null>(
    (best, r) => (r && (!best || (r[R.stp] as number) > (best[R.stp] as number)) ? r : best),
    null,
  );
  const ratings = computeTeamRatings(
    formationPlan(formation),
    starters.map((p, i) => {
      const r = eff[i];
      return p && r ? { ratings: r, foot: p.foot } : null;
    }),
    taker,
    sliders,
    c,
  );
  // Long-ball outlet: the front players' height, jumping and pace.
  const outlets: number[] = [];
  formation.slots.forEach((slot, i) => {
    const r = eff[i];
    if (r && ["ST", "W", "AM", "WM"].includes(slot.position)) {
      outlets.push(((r[R.hgt] as number) + (r[R.jmp] as number) + (r[R.spd] as number)) / 3);
    }
  });
  const target = outlets.reduce((sum, v) => sum + v, 0) / Math.max(1, outlets.length);
  return {
    ratings,
    longBall: target,
    overall: (ratings.passing + ratings.attack + ratings.defence + ratings.pressing) / 4,
  };
}

export function aiSliders(
  own: EngineTeamInput,
  opponent: EngineTeamInput,
  home: boolean,
  leagueDirectness: number,
  c: Coefficients = COEFFICIENTS,
): SliderSettings {
  const me = teamProfile(own, c);
  const them = teamProfile(opponent, c);
  const edge = me.overall - them.overall + (home ? 1.5 : -1.5);
  const mentality = edge >= 9 ? 2 : edge >= 4 ? 1 : edge <= -9 ? -2 : edge <= -4 ? -1 : 0;
  const pressing = clampStep((me.ratings.pressing - me.ratings.passing) / 5);
  const directness = clampStep((me.longBall - me.ratings.passing) / 6 + 2 * leagueDirectness);
  return { mentality, pressing, directness };
}
