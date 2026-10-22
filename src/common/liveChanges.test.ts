import { describe, expect, it } from "vitest";
import type { TacticsSetup } from "./api";
import { liveChanges } from "./liveChanges";

// A 4-4-2 on the pitch: slot 0 the keeper, 1–4 the back four (2 and 3 the centre-backs).
const now: TacticsSetup = {
  formation: "4-4-2",
  sliders: { mentality: 0, pressing: 0, directness: 0 },
  slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  bench: [21, 22, 23],
};
const edit = (slots: (number | null)[], patch: Partial<TacticsSetup> = {}): TacticsSetup => ({
  ...now,
  slots,
  ...patch,
});

describe("live changes from the tactics board", () => {
  it("send nothing when nothing changed", () => {
    expect(liveChanges(now, now)).toEqual({ changes: {}, problem: null });
  });

  it("send a swap between two players on the pitch as a free move", () => {
    const { changes, problem } = liveChanges(now, edit([1, 2, 3, 4, 5, 7, 6, 8, 9, 10, 11]));
    expect(problem).toBeNull();
    expect(changes).toEqual({ slots: [1, 2, 3, 4, 5, 7, 6, 8, 9, 10, 11] });
  });

  it("pair a substitute with the player whose slot he takes", () => {
    const { changes } = liveChanges(now, {
      ...edit([1, 2, 3, 4, 5, 6, 22, 8, 9, 10, 11]),
      bench: [21, 7, 23],
    });
    expect(changes.subs).toEqual([{ outPid: 7, inPid: 22 }]);
    expect(changes.slots?.[6]).toBe(22);
  });

  it("after a red card: a centre-back on for a midfielder, moved into the empty slot", () => {
    const tenMen = { ...now, slots: [1, 2, null, 4, 5, 6, 7, 8, 9, 10, 11] };
    const edited = { ...tenMen, slots: [1, 2, 21, 4, 5, 6, null, 8, 9, 10, 11] };
    const { changes, problem } = liveChanges(tenMen, edited);
    expect(problem).toBeNull();
    expect(changes.subs).toEqual([{ outPid: 7, inPid: 21 }]);
    expect(changes.slots).toEqual([1, 2, 21, 4, 5, 6, null, 8, 9, 10, 11]);
  });

  it("after a red card: moving a player into the empty slot is free", () => {
    const tenMen = { ...now, slots: [1, 2, null, 4, 5, 6, 7, 8, 9, 10, 11] };
    const { changes, problem } = liveChanges(tenMen, {
      ...tenMen,
      slots: [1, 2, 6, 4, 5, null, 7, 8, 9, 10, 11],
    });
    expect(problem).toBeNull();
    expect(changes).toEqual({ slots: [1, 2, 6, 4, 5, null, 7, 8, 9, 10, 11] });
  });

  it("refuse to fill a sent-off player's place or take a player off without a sub", () => {
    const tenMen = { ...now, slots: [1, 2, null, 4, 5, 6, 7, 8, 9, 10, 11] };
    expect(
      liveChanges(tenMen, { ...tenMen, slots: [1, 2, 21, 4, 5, 6, 7, 8, 9, 10, 11] }).problem,
    ).toMatch(/sent-off/);
    expect(liveChanges(now, edit([1, 2, 3, 4, 5, 6, null, 8, 9, 10, 11])).problem).toMatch(
      /take a player off/,
    );
    expect(liveChanges(now, edit([1, 2, 3, 4, 5, 6, 99, 8, 9, 10, 11])).problem).toMatch(/bench/);
  });

  it("send a new formation with everyone's slot, and only the sliders that moved", () => {
    const { changes } = liveChanges(
      now,
      edit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], {
        formation: "4-3-3",
        sliders: { mentality: 1, pressing: 0, directness: 0 },
      }),
    );
    expect(changes).toEqual({
      formation: "4-3-3",
      slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      sliders: { mentality: 1 },
    });
  });
});
