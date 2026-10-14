/**
 * Penalty shoot-out (SPEC §8.6): five kicks each, then sudden death. Takers go in order
 * of penalty rating with the keeper last; once everyone has taken one, the order repeats.
 * Each kick is penalty taker (`pen`) vs keeper (`gko`, `gkr`).
 */
import { RATING_INDEX as R } from "../../common/config/ratings";
import {
  avg,
  clamp,
  emit,
  onPitch,
  type MatchState,
  type PlayerState,
  type TeamState,
} from "./state";
import type { TeamSide } from "./types";

function takers(team: TeamState): PlayerState[] {
  const gkIndex = team.plan.formation.slots.findIndex((slot) => slot.position === "GK");
  const keeper = team.slots[gkIndex] ?? null;
  return onPitch(team)
    .filter((p) => p !== keeper)
    .sort(
      (a, b) => (b.eff[R.pen] as number) - (a.eff[R.pen] as number) || a.input.pid - b.input.pid,
    )
    .concat(keeper ? [keeper] : []);
}

export function playShootout(s: MatchState): [number, number] {
  const { c, rng } = s;
  const order: [PlayerState[], PlayerState[]] = [takers(s.teams[0]), takers(s.teams[1])];
  const keepers = s.teams.map(
    (t) => t.slots[t.plan.formation.slots.findIndex((slot) => slot.position === "GK")] ?? null,
  );
  const goals: [number, number] = [0, 0];
  const kicks: [number, number] = [0, 0];
  const first: TeamSide = rng.bool() ? 0 : 1;

  const kick = (side: TeamSide, suddenDeath: boolean) => {
    const list = order[side];
    const taker = list[kicks[side] % list.length] as PlayerState;
    const keeper = keepers[side === 0 ? 1 : 0];
    const keeperSkill = keeper ? avg(keeper.eff, "gko", "gkr") : 20;
    const p = clamp(
      c.penalty.shootoutBase +
        (c.penalty.slope * ((taker.eff[R.pen] as number) - 65)) / 10 -
        (c.penalty.slope * (keeperSkill - 63)) / 10 -
        (suddenDeath ? c.penalty.suddenDeath : 0),
      0.45,
      0.95,
    );
    const scored = rng.bool(p);
    kicks[side]++;
    if (scored) goals[side]++;
    emit(s, { type: "shootoutKick", side, pid: taker.input.pid, scored }, false);
  };

  // Best of five, stopping as soon as one side can't catch up.
  const second: TeamSide = first === 0 ? 1 : 0;
  for (let round = 0; round < 5; round++) {
    for (const side of [first, second]) {
      kick(side, false);
      const remaining = (team: TeamSide) => 5 - kicks[team];
      if (goals[0] + remaining(0) < goals[1] || goals[1] + remaining(1) < goals[0]) return goals;
    }
  }
  while (goals[0] === goals[1]) {
    kick(first, true);
    kick(second, true);
  }
  return goals;
}
