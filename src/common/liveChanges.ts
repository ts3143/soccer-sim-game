import type { LiveChanges, TacticsSetup } from "./api";
import type { SliderSettings } from "./schema";

/**
 * The live changes that turn the line-up on the pitch (`now`) into the one edited on the
 * tactics board (T, 2026-10-21). Bench players now in a slot come on; players no longer in
 * a slot go off; each sub is paired with the player whose slot he took where there is
 * one. Everyone's final slot is sent, so moving players around (into a sent-off player's
 * empty slot too) costs nothing. A sub can only come on for a player who goes off: the
 * problem says so in plain words, and the changes are then not to be sent.
 */
export function liveChanges(
  now: TacticsSetup,
  edited: TacticsSetup,
): { changes: LiveChanges; problem: string | null } {
  const onPitch = now.slots.filter((pid): pid is number => pid !== null);
  const after = edited.slots.filter((pid): pid is number => pid !== null);
  const incoming = after.filter((pid) => !onPitch.includes(pid));
  const outgoing = onPitch.filter((pid) => !after.includes(pid));

  let problem: string | null = null;
  if (incoming.some((pid) => !now.bench.includes(pid))) {
    problem = "Only the substitutes on the bench can come on.";
  } else if (incoming.length > outgoing.length) {
    problem =
      "A substitute can only come on for a player you take off: you can't fill a sent-off player's place.";
  } else if (outgoing.length > incoming.length) {
    problem = "To take a player off, bring a substitute on for him.";
  }

  const changes: LiveChanges = {};
  if (incoming.length > 0) {
    const left = [...outgoing];
    const pairs = incoming.map((inPid) => {
      const slot = edited.slots.indexOf(inPid);
      const there = edited.formation === now.formation ? now.slots[slot] : undefined;
      const outPid =
        there !== undefined && there !== null && left.includes(there) ? there : left[0];
      left.splice(left.indexOf(outPid as number), 1);
      return { outPid: outPid as number, inPid };
    });
    changes.subs = pairs;
  }
  if (edited.formation !== now.formation) changes.formation = edited.formation;
  // A new formation always carries everyone's slot (the engine would otherwise re-slot).
  const moved =
    edited.formation !== now.formation ||
    edited.slots.length !== now.slots.length ||
    edited.slots.some((pid, i) => pid !== now.slots[i]);
  if (moved) changes.slots = [...edited.slots];
  const sliders: Partial<SliderSettings> = {};
  for (const key of Object.keys(edited.sliders) as (keyof SliderSettings)[]) {
    if (edited.sliders[key] !== now.sliders[key]) sliders[key] = edited.sliders[key];
  }
  if (Object.keys(sliders).length > 0) changes.sliders = sliders;
  return { changes, problem };
}
