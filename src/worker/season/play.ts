/**
 * Plays season fixtures with each club's best XI and bench at full condition, the AI
 * picking both sides' tactics. A stand-in until rotation, condition and injuries arrive
 * (M3 chunk 4), which replace how the two squads are chosen, not how a fixture is played.
 */
import { isSenior } from "../../common/status";
import type { Club, Player } from "../../common/schema";
import { aiSliders } from "../engine/aiTactics";
import { simulateMatch } from "../engine/match";
import { teamInput } from "../engine/prepare";
import type { EngineTeamInput } from "../engine/types";
import type { PlayFixture } from "./season";

export function fullStrengthPlay(clubs: readonly Club[], players: readonly Player[]): PlayFixture {
  const squads = new Map<number, Player[]>();
  for (const p of players) {
    if (p.cid !== null && isSenior(p)) squads.set(p.cid, [...(squads.get(p.cid) ?? []), p]);
  }
  const inputs = new Map<number, EngineTeamInput>(
    clubs.map((c) => [c.cid, teamInput(c, squads.get(c.cid) ?? [])]),
  );
  const input = (cid: number) => {
    const team = inputs.get(cid);
    if (!team) throw new Error(`No squad for club ${cid}`);
    return team;
  };
  return (fixture, setup) => {
    const home = input(fixture.homeCid);
    const away = input(fixture.awayCid);
    return simulateMatch({
      seed: setup.seed,
      home: { ...home, sliders: aiSliders(home, away, !setup.neutral, setup.style.directness) },
      away: { ...away, sliders: aiSliders(away, home, false, setup.style.directness) },
      neutralVenue: setup.neutral,
      style: setup.style,
      knockout: setup.knockout,
      feed: false,
    });
  };
}
