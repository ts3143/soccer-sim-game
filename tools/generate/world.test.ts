import { describe, expect, it } from "vitest";
import { worlds } from "../../src/common/config/worlds";
import { clubDefinitions } from "../../src/common/config/clubs";
import { generateWorld } from "../../src/worker/generate/world";
import { realClubNamesToCheck } from "../real-club-names";
import { evaluateWorld } from "../../src/worker/generate/checks";
import { fingerprints } from "../../src/worker/fingerprint";

const options = {
  config: worlds.classic,
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

  // Generating a world takes seconds (more on slower CI machines): allow up to a minute.
  it("is identical for the same seed and different for another", { timeout: 60_000 }, () => {
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

  // Recorded from main (50616fc) before the Super League work: a new Classic world stays
  // exactly this (MILESTONES SL0). Re-record only for a change T approved.
  it("generates exactly the recorded Classic world", async () => {
    expect(await fingerprints({ ...world })).toEqual({
      meta: "572fff5668d82e7e",
      competitions: "7c8eb2984df9ee1d",
      clubs: "1b849c65c61e6cdc",
      clubSeasons: "6858b15c259cd513",
      players: "60eeb9aef2dd9623",
      xiStrength: "7dbc52133ca8565b",
    });
  });
});
