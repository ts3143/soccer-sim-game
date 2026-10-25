import { describe, expect, it } from "vitest";
import type { Club } from "../../common/schema";
import { LOCAL_SHARE, localBirthplace } from "./birthplace";
import { nameFiles } from "./nameData";
import { generateWorld } from "./world";

const club = { city: "Leeds", country: "ENG" };

describe("birthplaces: local lads (T, 2026-10-25)", () => {
  it("makes about half of a club's home-country academy players born in its city", () => {
    const local = Array.from({ length: 400 }, (_, pid) =>
      localBirthplace("seed", { pid, nationality: "ENG" }, club),
    );
    expect(new Set(local)).toEqual(new Set(["Leeds", null]));
    const share = local.filter((c) => c === "Leeds").length / local.length;
    expect(Math.abs(share - LOCAL_SHARE)).toBeLessThan(0.08);
    // The same player, the same answer; a foreigner is never a local lad.
    expect(localBirthplace("seed", { pid: 7, nationality: "ENG" }, club)).toBe(local[7]);
    expect(
      Array.from({ length: 50 }, (_, pid) =>
        localBirthplace("seed", { pid, nationality: "FRA" }, club),
      ).every((c) => c === null),
    ).toBe(true);
  });

  it(
    "in a new world: local academy players, everyone else from the name data",
    { timeout: 60_000 },
    () => {
      const world = generateWorld({
        seed: "birthplaces",
        name: "t",
        userCid: 0,
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      const clubs = new Map<number, Club>(world.clubs.map((c) => [c.cid, c]));
      const homeAcademy = world.players.filter(
        (p) => p.status === "academy" && clubs.get(p.cid ?? -1)?.country === p.nationality,
      );
      const local = homeAcademy.filter((p) => p.birthplace === clubs.get(p.cid ?? -1)?.city);
      expect(Math.abs(local.length / homeAcademy.length - LOCAL_SHARE)).toBeLessThan(0.1);
      for (const p of world.players) {
        if (local.includes(p)) continue;
        const places = (nameFiles[p.nationality]?.birthplaces ?? []).map(([label]) => label);
        if (places.length > 0) expect(places).toContain(p.birthplace);
      }
    },
  );
});
