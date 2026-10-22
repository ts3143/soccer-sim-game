import type { TacticsPlayerView, TacticsView } from "../../common/api";
import { positionFit } from "./pitchLayout";

/** A place in the line-up editor: a formation slot, a bench spot, or a reserve. */
export type Place = { area: "slot" | "bench"; index: number } | { area: "reserve"; pid: number };

export const samePlace = (a: Place, b: Place) =>
  a.area === b.area &&
  (a.area === "reserve" ? a.pid === (b as typeof a).pid : a.index === (b as typeof a).index);

/** Natural: within 3 OVR of his best; cover: 4–8 below (the profile's position-map bands). */
export type Fit = "natural" | "cover" | null;

/**
 * How a player suits slot `slot` of the formation shown. Keepers and outfielders never mix:
 * a weak player's OVRs bunch together, so by the bands alone a 16-year-old keeper could
 * "cover" in midfield.
 */
export function slotFit(view: TacticsView, p: TacticsPlayerView, slot: number): Fit {
  const ovr = p.slotOvrs[slot];
  const position = view.slots[slot]?.position;
  if (ovr === undefined || position === undefined) return null;
  if ((position === "GK") !== (p.position === "GK")) return null;
  const fit = positionFit(ovr, p.bestOvr);
  return fit === "best" || fit === "comfortable" ? "natural" : fit === "cover" ? "cover" : null;
}

const weaker = (a: Fit, b: Fit): Fit =>
  a === null || b === null ? null : a === "cover" || b === "cover" ? "cover" : "natural";

export function playerAt(view: TacticsView, place: Place): TacticsPlayerView | null {
  if (place.area === "reserve") return view.reserves.find((p) => p.pid === place.pid) ?? null;
  if (place.area === "slot") return view.slots[place.index]?.player ?? null;
  return view.bench[place.index] ?? null;
}

/**
 * How sensible it is to move the player at `from` to `to`, for highlighting while he's
 * dragged or picked (T, 2026-10-21). Into a slot, he must suit it. Out of a slot onto the
 * bench or reserves, the player coming in must suit it. Between two slots, both must suit
 * their new slots, and the weaker fit counts. Moves among the bench and reserves aren't
 * positional, so they're never highlighted. During a live match (`live`) an empty slot is
 * a sent-off player's: only a player already on the pitch can move into it.
 */
export function moveFit(view: TacticsView, from: Place, to: Place, live = false): Fit {
  if (samePlace(from, to)) return null;
  const mover = playerAt(view, from);
  if (!mover) return null;
  const other = playerAt(view, to);
  if (live && to.area === "slot" && !other && from.area !== "slot") return null;
  if (to.area === "slot") {
    const there = slotFit(view, mover, to.index);
    return from.area === "slot" && other ? weaker(there, slotFit(view, other, from.index)) : there;
  }
  return from.area === "slot" && other ? slotFit(view, other, from.index) : null;
}
