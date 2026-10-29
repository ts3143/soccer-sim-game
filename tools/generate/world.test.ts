import { describe, expect, it } from "vitest";
import { worlds } from "../../src/common/config/worlds";
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
    const checks = evaluateWorld(world, worlds.classic, {
      realNames: realClubNamesToCheck().names,
    });
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
    expect(world.clubs.map((c) => c.cid)).toEqual(worlds.classic.clubs.map((_, i) => i));
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
  // exactly this (MILESTONES SL0). Re-record only for a change T approved. `meta` was
  // re-recorded once, for the world's id the save now records (SPEC §17.1): without it,
  // the hash was main's. `clubs` was re-recorded for T's club names (SPEC §17.3, SL1): with
  // the old names put back, the world was byte-for-byte main's. `draftPicks` (SL4) is new
  // and empty in Classic: its hash is the empty list's.
  it("generates exactly the recorded Classic world", async () => {
    expect(await fingerprints({ ...world })).toEqual({
      meta: "1599e4ca3c158396",
      competitions: "7c8eb2984df9ee1d",
      clubs: "a979b40c04866ebc",
      clubSeasons: "6858b15c259cd513",
      players: "60eeb9aef2dd9623",
      draftPicks: "4f53cda18c2baa0c",
      xiStrength: "7dbc52133ca8565b",
    });
  });
});

describe("generateWorld for the Super League", () => {
  const options = {
    config: worlds.superLeague,
    seed: "super-league-test",
    name: "Test",
    userCid: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
  const world = generateWorld(options);

  it("passes its acceptance checks: 48 clubs, XIs on strength, tiers in order, capped payrolls", () => {
    const checks = evaluateWorld(world, worlds.superLeague, {
      realNames: realClubNamesToCheck().names,
    });
    expect(checks.filter((c) => !c.pass)).toEqual([]);
    expect(checks.map((c) => c.name)).toContain("tiers ordered by strength on average");
  });

  it("has no academies, no past fees, and records its world", { timeout: 60_000 }, () => {
    expect(world.players.some((p) => p.status === "academy")).toBe(false);
    expect(world.players.every((p) => p.feeBalance === null || p.feeBalance === undefined)).toBe(
      true,
    );
    expect(world.meta.world.id).toBe("superLeague");
    expect(world.clubs.map((c) => c.leagueId)).toEqual(
      worlds.superLeague.clubs.map((c) => c.league),
    );
    expect(JSON.stringify(generateWorld(options))).toBe(JSON.stringify(world));
  });
});
