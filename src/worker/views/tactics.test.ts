import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { TacticsSetup } from "../../common/api";
import { createLeague, openLeague } from "../league/session";
import { getTactics, previewTactics, saveTactics } from "./tactics";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

const rating = (v: { ratings: { key: string; value: number }[] }, key: string) =>
  v.ratings.find((r) => r.key === key)?.value ?? NaN;

describe("tactics", () => {
  it(
    "starts as the AI's pick, previews changes, saves the line-up and checks the rules",
    { timeout: 120_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Tactics",
        seed: "tactics-view",
        userCid: 0,
      });
      const session = await openLeague(league.lid);

      // A new league saves the AI's pick as the user's tactics.
      const auto = await getTactics(league.lid, null);
      expect(auto.editable).toBe(true);
      expect(auto.saved).toBe(true);
      expect(session.cache.get("clubs", 0)?.tactics.lineup).toEqual({
        slots: auto.setup.slots,
        bench: auto.setup.bench,
      });
      expect(auto.slots).toHaveLength(11);
      expect(auto.slots.every((s) => s.player !== null)).toBe(true);
      expect(auto.slots[0]?.label).toBe("GK");
      expect(auto.bench).toHaveLength(9);
      expect(auto.reserves.length).toBeGreaterThan(0);
      expect(auto.ratings.map((r) => r.key)).toHaveLength(7);
      expect(auto.ratings.every((r) => r.value > 20 && r.value < 100)).toBe(true);

      // A new formation keeps the same eleven, each in his best slot.
      const other = auto.setup.formation === "4-4-2" ? "4-3-3" : "4-4-2";
      const moved = await previewTactics(league.lid, { ...auto.setup, formation: other }, "reslot");
      expect(moved.setup.formation).toBe(other);
      expect(new Set(moved.setup.slots)).toEqual(new Set(auto.setup.slots));

      // Sliders move the ratings: attacking raises Attack and lowers Defence.
      const attacking = await previewTactics(
        league.lid,
        { ...auto.setup, sliders: { ...auto.setup.sliders, mentality: 2 } },
        "asIs",
      );
      const defensive = await previewTactics(
        league.lid,
        { ...auto.setup, sliders: { ...auto.setup.sliders, mentality: -2 } },
        "asIs",
      );
      expect(rating(attacking, "attack")).toBeGreaterThan(rating(defensive, "attack"));
      expect(rating(attacking, "defence")).toBeLessThan(rating(defensive, "defence"));

      // The bench keeper up front: worse attack; an empty slot is flagged.
      const keeper = auto.bench.find((p) => p.position === "GK")?.pid ?? -1;
      const striker = auto.slots.length - 1;
      const odd: TacticsSetup = {
        ...auto.setup,
        slots: auto.setup.slots.map((pid, i) => (i === striker ? keeper : pid)),
        bench: auto.setup.bench.filter((pid) => pid !== keeper),
      };
      const oddView = await previewTactics(league.lid, odd, "asIs");
      expect(rating(oddView, "attack")).toBeLessThan(rating(auto, "attack"));
      expect(oddView.warnings).toContain("No goalkeeper on the bench.");
      const gap = await previewTactics(
        league.lid,
        { ...auto.setup, slots: auto.setup.slots.map((pid, i) => (i === striker ? null : pid)) },
        "asIs",
      );
      expect(gap.warnings).toContain("1 slot is empty.");

      // Saving keeps it, and the formation becomes the club's.
      const saved = await saveTactics(league.lid, moved.setup);
      expect(saved.saved).toBe(true);
      expect(saved.setup).toEqual(moved.setup);
      expect(session.cache.get("clubs", 0)?.tactics.formation).toBe(other);
      expect((await getTactics(league.lid, null)).setup).toEqual(moved.setup);

      // The rules.
      const first = auto.setup.slots[1] ?? -1;
      const outsider = session.cache.getAll("players").find((p) => p.cid === 1)?.pid ?? -1;
      const bad: [TacticsSetup, RegExp][] = [
        [{ ...auto.setup, bench: [...auto.setup.bench, first] }, /bench holds 9|picked twice/],
        [{ ...auto.setup, bench: [first, ...auto.setup.bench.slice(1)] }, /picked twice/],
        [{ ...auto.setup, bench: [outsider] }, /Only players from your club/],
        [{ ...auto.setup, sliders: { ...auto.setup.sliders, pressing: 3 } }, /whole steps/],
        [{ ...auto.setup, formation: "4-1-4-1" }, /isn't one of the formations/],
      ];
      for (const [setup, message] of bad) {
        await expect(saveTactics(league.lid, setup)).rejects.toThrow(message);
      }

      // A player who leaves drops out; injured and suspended starters stay, flagged.
      const leaver = moved.setup.slots[5] ?? -1;
      const hurt = moved.setup.slots[6] ?? -1;
      const banned = moved.setup.slots[7] ?? -1;
      const date = session.cache.get("meta", "game") as { date: string };
      const leaving = session.cache.get("players", leaver);
      const injured = session.cache.get("players", hurt);
      const suspended = session.cache.get("players", banned);
      if (!leaving || !injured || !suspended) throw new Error("missing players");
      session.cache.put("players", { ...leaving, cid: 1 });
      session.cache.put("players", {
        ...injured,
        injury: { type: "Hamstring", until: "2026-09-01" },
      });
      session.cache.put("players", { ...suspended, suspension: { remaining: 2, date: date.date } });
      const after = await getTactics(league.lid, null);
      expect(after.setup.slots[5]).toBeNull();
      expect(after.setup.slots[6]).toBe(hurt);
      expect(after.setup.slots[7]).toBe(banned);
      expect(after.warnings).toContain("1 slot is empty.");
      expect(after.warnings.some((w) => w.includes("injured until 1 Sep 2026"))).toBe(true);
      expect(after.warnings.some((w) => w.endsWith("is suspended for the next 2 matches."))).toBe(
        true,
      );
      expect(date.date).toBe("2026-07-01");
      // They can be saved there, and moved to the bench.
      const benched: TacticsSetup = {
        ...after.setup,
        slots: after.setup.slots.map((pid) => (pid === banned ? null : pid)),
        bench: [banned, ...after.setup.bench.slice(0, 8)],
      };
      const kept = await saveTactics(league.lid, benched);
      expect(kept.setup.bench[0]).toBe(banned);
      expect(kept.warnings).toContain("1 suspended player on the bench.");

      // Another club: the AI's pick, read-only.
      const theirs = await getTactics(league.lid, 1);
      expect(theirs.editable).toBe(false);
      expect(theirs.slots.every((s) => s.player !== null)).toBe(true);
    },
  );
});
