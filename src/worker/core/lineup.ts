/**
 * Best XI for a formation: the assignment of players to the 11 slots that maximises the
 * total slot OVR (position OVR minus wrong-foot penalties). Club `strength` is defined
 * as the mean slot OVR of this XI in the club's default formation (SPEC §8.2).
 */
import type { Formation } from "../../common/config/formations";
import type { Player } from "../../common/schema";
import { maximizeAssignment } from "./assignment";
import { slotOvr } from "./ovr";

export interface XiPick {
  /** Player index (into the candidates array) for each formation slot. */
  playerIndexBySlot: number[];
  slotOvrs: number[];
  meanOvr: number;
}

export function bestXi(
  candidates: readonly Pick<Player, "ovrs" | "foot">[],
  formation: Formation,
): XiPick {
  const scores = formation.slots.map((slot) => candidates.map((p) => slotOvr(p, slot)));
  const playerIndexBySlot = maximizeAssignment(scores);
  const slotOvrs = playerIndexBySlot.map(
    (index, slot) => (scores[slot] as number[])[index] as number,
  );
  return {
    playerIndexBySlot,
    slotOvrs,
    meanOvr: slotOvrs.reduce((s, v) => s + v, 0) / slotOvrs.length,
  };
}
