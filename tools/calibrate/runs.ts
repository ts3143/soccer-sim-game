/**
 * Simulation runs for the calibration harness: a neutral sample (random same-league
 * pairings, all league style modifiers at 1.0) and full double round-robin seasons per
 * league with that league's style. Squads are each club's best XI and bench, at full
 * condition (no rotation or fatigue between matches until M3).
 */
import type { StyleModifiers } from "../../src/common/config/competitions";
import { worlds } from "../../src/common/config/worlds";
import type { Club, Player } from "../../src/common/schema";
import { Random } from "../../src/worker/core/random";
import { aiSliders, teamProfile } from "../../src/worker/engine/aiTactics";
import { COEFFICIENTS, type Coefficients } from "../../src/worker/engine/coefficients";
import { simulateMatch } from "../../src/worker/engine/match";
import { teamInput } from "../../src/worker/engine/prepare";
import type { TeamRatings } from "../../src/worker/engine/teamRatings";
import type { EngineTeamInput, MatchResult } from "../../src/worker/engine/types";
import type { World } from "../../src/worker/generate/world";

export const NEUTRAL: StyleModifiers = { chanceQuality: 1, foulRate: 1, directness: 0 };

export interface SimulatedMatch {
  league: string;
  homeCid: number;
  awayCid: number;
  result: MatchResult;
  /** Pre-match team ratings (with the sliders each side played), for the Team OVR fit. */
  ratings: [TeamRatings, TeamRatings];
}

export class League {
  readonly world: World;
  readonly inputs = new Map<number, EngineTeamInput>();
  readonly clubsByLeague = new Map<string, Club[]>();

  constructor(world: World) {
    this.world = world;
    const squads = new Map<number, Player[]>();
    for (const p of world.players) {
      if (p.cid !== null) squads.set(p.cid, [...(squads.get(p.cid) ?? []), p]);
    }
    for (const club of world.clubs)
      this.inputs.set(club.cid, teamInput(club, squads.get(club.cid) ?? []));
    for (const l of worlds.classic.competitions.leagues) {
      this.clubsByLeague.set(
        l.id,
        world.clubs.filter((c) => c.leagueId === l.id),
      );
    }
  }

  play(
    league: string,
    homeCid: number,
    awayCid: number,
    seed: string,
    style: StyleModifiers,
    c: Coefficients = COEFFICIENTS,
  ): SimulatedMatch {
    const home = this.inputs.get(homeCid) as EngineTeamInput;
    const away = this.inputs.get(awayCid) as EngineTeamInput;
    const homeSliders = aiSliders(home, away, true, style.directness, c);
    const awaySliders = aiSliders(away, home, false, style.directness, c);
    const result = simulateMatch(
      {
        seed,
        home: { ...home, sliders: homeSliders },
        away: { ...away, sliders: awaySliders },
        neutralVenue: false,
        style,
        knockout: null,
        feed: false,
      },
      c,
    );
    return {
      league,
      homeCid,
      awayCid,
      result,
      ratings: [
        teamProfile(home, c, homeSliders).ratings,
        teamProfile(away, c, awaySliders).ratings,
      ],
    };
  }

  /** N matches between random pairs of clubs from the same league, styles neutral. */
  neutralSample(n: number, seed: string, c: Coefficients = COEFFICIENTS): SimulatedMatch[] {
    const fixtures = Random.fromSeed(`${seed}/fixtures`);
    const weights = worlds.classic.competitions.leagues.map((l) => ({
      id: l.id,
      w: l.clubs * (l.clubs - 1),
    }));
    const out: SimulatedMatch[] = [];
    for (let i = 0; i < n; i++) {
      const league = fixtures.weighted(weights, (l) => l.w).id;
      const [home, away] = fixtures.shuffle(this.clubsByLeague.get(league) ?? []).slice(0, 2) as [
        Club,
        Club,
      ];
      out.push(this.play(league, home.cid, away.cid, `${seed}/match:${i}`, NEUTRAL, c));
    }
    return out;
  }

  /** `seasons` double round-robins of one league, with the league's own style. */
  seasons(
    league: string,
    seasons: number,
    seed: string,
    c: Coefficients = COEFFICIENTS,
  ): SimulatedMatch[][] {
    const config = worlds.classic.competitions.leagues.find((l) => l.id === league);
    if (!config) throw new Error(`Unknown league ${league}`);
    const clubs = this.clubsByLeague.get(league) ?? [];
    return Array.from({ length: seasons }, (_, s) => {
      const matches: SimulatedMatch[] = [];
      for (const home of clubs) {
        for (const away of clubs) {
          if (home === away) continue;
          matches.push(
            this.play(
              league,
              home.cid,
              away.cid,
              `${seed}/${league}/s${s}/${home.cid}-${away.cid}`,
              config.styleModifiers,
              c,
            ),
          );
        }
      }
      return matches;
    });
  }
}
