import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { addDays } from "../../common/dates";
import { generateWorld } from "../generate/world";
import {
  firstLeagueDay,
  freeAgencyDay,
  freeAgencyDays,
  freeAgencyOpen,
  rosterDeadline,
  trimSquads,
} from "./freeAgency";
import { type LoopWorld, startingReputation } from "./offseason";
import { createSeason } from "./season";

const config = worlds.superLeague.competitions;
const SEED = "free-agency-test";
const sl = generateWorld({
  config: worlds.superLeague,
  seed: SEED,
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const state = createSeason({
  config,
  season: 2026,
  seed: SEED,
  clubs: sl.clubs,
  lastFinish: new Map(),
  firstFid: 1,
});

function world(): LoopWorld {
  let pid = Math.max(...sl.players.map((p) => p.pid)) + 1;
  return {
    config: worlds.superLeague,
    clubs: structuredClone(sl.clubs),
    players: structuredClone(sl.players),
    reputation: startingReputation(worlds.superLeague.clubs),
    clubSeasons: new Map(structuredClone(sl.clubSeasons).map((r) => [r.cid, r])),
    userCid: 0,
    seed: SEED,
    nextPid: () => pid++,
  };
}
const seniors = (w: LoopWorld, cid: number) =>
  w.players.filter((p) => p.cid === cid && p.status === "club");

describe("free agency in the Super League", () => {
  it("closes at the roster deadline, after round 18 of 30; AI market days come before", () => {
    const deadline = rosterDeadline(config, state.fixtures) as string;
    const round18 = state.fixtures
      .filter((f) => f.competition === "STAR" && f.round === "18")
      .map((f) => f.date)
      .sort();
    expect(deadline).toBe(round18.at(-1));
    expect(deadline).toMatch(/^2027-0[12]-/);
    expect(firstLeagueDay(config, state.fixtures)).toBe(
      state.fixtures.map((f) => f.date).sort()[0],
    );
    // Open from 1 July to the deadline; closed from then until the next 1 July.
    expect(freeAgencyOpen(2026, "2026-07-01", deadline)).toBe(true);
    expect(freeAgencyOpen(2026, deadline, deadline)).toBe(true);
    expect(freeAgencyOpen(2026, addDays(deadline, 1), deadline)).toBe(false);
    expect(freeAgencyOpen(2026, "2027-06-20", deadline)).toBe(false);
    // The AI's market days: weekly from 8 July, busy to 31 August, then gap days.
    const days = freeAgencyDays(2026, config, deadline);
    expect(days[0]).toEqual({ date: "2026-07-08", busy: true });
    expect(days.filter((d) => d.busy).at(-1)?.date).toBe("2026-08-26");
    expect(days.find((d) => !d.busy)?.date).toBe("2026-09-02");
    expect((days.at(-1)?.date ?? "") <= deadline).toBe(true);
  });

  it("signs a few a market day: up to 22 in the summer, after it only into gaps", () => {
    const w = world();
    for (const [cid, keep] of [
      [1, 15],
      [2, 17],
      [3, 21],
    ] as const) {
      for (const p of seniors(w, cid).slice(keep)) {
        p.status = "freeAgent";
        p.cid = null;
        p.contract = null;
      }
    }
    const busy = freeAgencyDay(w, 2026, { date: "2026-07-08", busy: true });
    const signed = (cid: number) => busy.transactions.filter((t) => t.cids[0] === cid).length;
    expect([signed(1), signed(2), signed(3)]).toEqual([2, 2, 1]);
    const gap = freeAgencyDay(w, 2026, { date: "2026-09-02", busy: false });
    // Now 17, 19 and 22: only the club below 18 signs, up to 18.
    expect(gap.transactions.map((t) => t.cids[0])).toEqual([1]);
    expect(seniors(w, 1)).toHaveLength(18);
  });

  it("trims AI squads to 25 by value before a league match, keeping two keepers", () => {
    const w = world();
    const free = w.players.filter((p) => p.status === "freeAgent");
    for (const cid of [0, 1]) {
      for (const p of free.splice(0, 30 - seniors(w, cid).length)) {
        p.status = "club";
        p.cid = cid;
        p.contract = { wage: 1_000_000, expires: "2028-06-30" };
      }
    }
    const before = seniors(w, 1);
    const log = trimSquads(w, 2026, "2026-08-15");
    expect(seniors(w, 1)).toHaveLength(25);
    expect(seniors(w, 0)).toHaveLength(30); // the user's: he releases his own
    expect(seniors(w, 1).filter((p) => p.position === "GK").length).toBeGreaterThanOrEqual(2);
    const released = before.filter((p) => log.changed.has(p.pid));
    expect(released).toHaveLength(5);
    expect(released.every((p) => p.status === "freeAgent")).toBe(true);
    // Paid until their contracts end, as the user's releases are.
    const club = w.clubs.find((c) => c.cid === 1);
    expect(club?.released?.map((r) => r.pid).sort()).toEqual(released.map((p) => p.pid).sort());
    expect(log.transactions.every((t) => t.type === "release")).toBe(true);
  });
});
