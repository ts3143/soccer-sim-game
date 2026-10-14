import { describe, expect, it } from "vitest";
import { clubDefinitions } from "../../src/common/config/clubs";
import { generateWorld } from "../../src/worker/generate/world";
import { realClubNamesToCheck } from "../real-club-names";
import { evaluateWorld } from "../../src/worker/generate/checks";

const options = {
  seed: "world-test",
  name: "Test",
  userCid: 3,
  createdAt: "2026-07-01T00:00:00.000Z",
};
const world = generateWorld(options);

describe("generateWorld", () => {
  it("passes every M1 acceptance check", () => {
    const checks = evaluateWorld(world, { realNames: realClubNamesToCheck().names });
    expect(checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("is identical for the same seed and different for another", () => {
    const again = generateWorld(options);
    expect(JSON.stringify(again)).toBe(JSON.stringify(world));
    const other = generateWorld({ ...options, seed: "another-seed" });
    expect(
      other.players[0]?.lastName === world.players[0]?.lastName &&
        other.players[0]?.birthDate === world.players[0]?.birthDate,
    ).toBe(false);
  });

  it("uses integer IDs, saves the default formation as tactics, and records the user club", () => {
    expect(world.clubs.map((c) => c.cid)).toEqual(clubDefinitions.map((_, i) => i));
    expect(new Set(world.players.map((p) => p.pid)).size).toBe(world.players.length);
    expect(world.players.every((p) => Number.isInteger(p.pid))).toBe(true);
    expect(world.meta.ids.pid).toBe(Math.max(...world.players.map((p) => p.pid)) + 1);
    for (const club of world.clubs) expect(club.tactics.formation).toMatch(/^\d(-\d)+$/);
    expect(world.meta.game.userCid).toBe(3);
  });

  it("gives seniors contracts ending 30 June and academy players none", () => {
    for (const player of world.players) {
      if (player.status === "club")
        expect(player.contract?.expires).toMatch(/^20(27|28|29|30|31)-06-30$/);
      else expect(player.contract).toBeNull();
    }
    const finalYear = world.players.filter((p) => p.contract?.expires === "2027-06-30").length;
    expect(finalYear).toBeGreaterThan(0);
  });

  it("stores whole-euro wages and a unique shirt number per club", () => {
    for (const club of world.clubs) {
      const squad = world.players.filter((p) => p.cid === club.cid);
      const numbers = squad.map((p) => p.shirtNumber);
      expect(new Set(numbers).size).toBe(squad.length);
    }
    expect(
      world.players.every((p) => p.contract === null || Number.isInteger(p.contract.wage)),
    ).toBe(true);
  });
});
