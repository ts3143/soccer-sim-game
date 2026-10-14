/**
 * Builds engine input from saved data. M2 uses each club's best XI in its formation and
 * a bench of the next-best players (with a back-up keeper); M3's rotation AI replaces
 * this with condition- and fixture-aware selection.
 */
import { formationById, formationsConfig } from "../../common/config/formations";
import type { Club, Player } from "../../common/schema";
import { bestXi } from "../core/lineup";
import type { EnginePlayer, EngineTeamInput } from "./types";

export function enginePlayer(player: Player): EnginePlayer {
  const ratings = player.ratingsHistory[player.ratingsHistory.length - 1]?.ratings;
  if (!ratings) throw new Error(`Player ${player.pid} has no ratings`);
  return {
    pid: player.pid,
    ratings,
    condition: player.condition,
    foot: player.foot,
    injuryProne: player.hidden.injuryProne,
    hothead: player.hidden.hothead,
  };
}

/** Matchday squad for a club: best XI in its formation plus up to 9 substitutes. */
export function teamInput(club: Club, squad: readonly Player[]): EngineTeamInput {
  const available = squad.filter((p) => p.status === "club" && p.injury === null);
  const formation = formationById(club.tactics.formation);
  const xi = bestXi(available, formation);
  const lineup = xi.playerIndexBySlot.map((i) => (available[i] as Player).pid);
  const rest = available
    .filter((p) => !lineup.includes(p.pid))
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  const keeper = rest.find((p) => p.position === "GK");
  const outfield = rest.filter((p) => p !== keeper);
  const bench = [...(keeper ? [keeper] : []), ...outfield]
    .slice(0, formationsConfig.benchSize)
    .map((p) => p.pid);
  const inSquad = new Set([...lineup, ...bench]);
  return {
    cid: club.cid,
    formation: formation.id,
    lineup,
    bench,
    players: available.filter((p) => inSquad.has(p.pid)).map(enginePlayer),
    sliders: { ...club.tactics.sliders },
    autoManage: club.tactics.auto,
    medicalDial: club.budget.medical,
  };
}
