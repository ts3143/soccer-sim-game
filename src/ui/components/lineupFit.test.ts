import { describe, expect, it } from "vitest";
import type { TacticsPlayerView, TacticsView } from "../../common/api";
import type { Position } from "../../common/config/ratings";
import { moveFit, slotFit } from "./lineupFit";

// A 3-slot formation for the tests: slot 0 = GK, slot 1 = CB, slot 2 = CM.
const player = (pid: number, position: Position, slotOvrs: number[]): TacticsPlayerView =>
  ({ pid, position, slotOvrs, bestOvr: Math.max(...slotOvrs) }) as TacticsPlayerView;
const keeper = player(1, "GK", [70, 20, 25]);
const centreBack = player(2, "CB", [15, 72, 66]); // CM 6 below his best: cover
const midfielder = player(3, "CM", [15, 60, 74]); // CB 14 below: no fit
const benchMid = player(4, "CM", [10, 55, 71]);
const benchBack = player(5, "CB", [12, 69, 52]);
const reserveMid = player(6, "CM", [10, 50, 68]);
const youngKeeper = player(7, "GK", [40, 36, 37]); // every OVR low and bunched together
const view = {
  slots: [
    { position: "GK", player: keeper },
    { position: "CB", player: centreBack },
    { position: "CM", player: midfielder },
  ],
  bench: [benchMid, benchBack, youngKeeper],
  reserves: [reserveMid],
} as unknown as TacticsView;

describe("line-up fit highlights", () => {
  it("rates a slot against the player's best OVR: within 3 natural, 4–8 cover", () => {
    expect(slotFit(view, centreBack, 1)).toBe("natural");
    expect(slotFit(view, centreBack, 2)).toBe("cover");
    expect(slotFit(view, midfielder, 1)).toBe(null);
    expect(slotFit(view, player(8, "CB", [0, 50, 47]), 2)).toBe("natural");
    expect(slotFit(view, player(8, "CB", [0, 50, 42]), 2)).toBe("cover");
    expect(slotFit(view, player(8, "CB", [0, 50, 41]), 2)).toBe(null);
  });

  it("never mixes keepers and outfielders, even when a weak player's OVRs bunch together", () => {
    expect(slotFit(view, youngKeeper, 0)).toBe("natural");
    expect(slotFit(view, youngKeeper, 1)).toBe(null);
    expect(slotFit(view, youngKeeper, 2)).toBe(null);
    expect(slotFit(view, player(9, "CM", [36, 35, 40]), 0)).toBe(null);
    expect(moveFit(view, { area: "slot", index: 0 }, { area: "bench", index: 2 })).toBe("natural");
    expect(moveFit(view, { area: "slot", index: 2 }, { area: "bench", index: 2 })).toBe(null);
  });

  it("taking a midfielder out highlights the midfielders who could come in", () => {
    const from = { area: "slot", index: 2 } as const;
    expect(moveFit(view, from, { area: "bench", index: 0 })).toBe("natural");
    expect(moveFit(view, from, { area: "bench", index: 1 })).toBe(null);
    expect(moveFit(view, from, { area: "reserve", pid: 6 })).toBe("natural");
  });

  it("a bench player highlights the slots he suits", () => {
    const from = { area: "bench", index: 1 } as const;
    expect(moveFit(view, from, { area: "slot", index: 1 })).toBe("natural");
    expect(moveFit(view, from, { area: "slot", index: 2 })).toBe(null);
    expect(moveFit(view, from, { area: "slot", index: 0 })).toBe(null);
  });

  it("a swap inside the XI needs both players to fit, the weaker fit counting", () => {
    // The centre-back to CM (cover) and the midfielder to CB (no fit): nothing.
    expect(moveFit(view, { area: "slot", index: 1 }, { area: "slot", index: 2 })).toBe(null);
  });

  it("never highlights the player's own place or moves among the bench and reserves", () => {
    expect(moveFit(view, { area: "slot", index: 1 }, { area: "slot", index: 1 })).toBe(null);
    expect(moveFit(view, { area: "bench", index: 0 }, { area: "reserve", pid: 6 })).toBe(null);
    expect(moveFit(view, { area: "bench", index: 0 }, { area: "bench", index: 1 })).toBe(null);
  });
});
