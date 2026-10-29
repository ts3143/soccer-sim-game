import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Player } from "../../common/schema";
import { exactAge } from "../../common/dates";
import { clubStrength } from "../club/standing";
import { rookieWage } from "../season/draft";
import { generateWorld } from "../generate/world";
import {
  clubView,
  pickTradeValue,
  playerTradeValue,
  rookieRoom,
  talentValue,
  tradeDay,
  type TradeWorld,
  tradeState,
  valueChange,
} from "./tradeValue";

const config = worlds.superLeague;
const trades = config.competitions.trades;
if (!trades) throw new Error("The Super League has trades");
const SEED = "trade-value-test";
const DATE = "2026-07-01";
const generated = generateWorld({
  config,
  seed: SEED,
  name: "t",
  userCid: 0,
  createdAt: `${DATE}T00:00:00.000Z`,
});
const world: TradeWorld = {
  config,
  clubs: generated.clubs,
  players: generated.players,
  draftPicks: generated.draftPicks,
};
const day = tradeDay(world, 2026, DATE);
const seniors = (cid: number) =>
  world.players
    .filter((p) => p.cid === cid && p.status === "club")
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);

describe("trade valuation", () => {
  it("two average players never buy a star", () => {
    const all = world.players.filter((p) => p.status === "club");
    const mean = all.reduce((s, p) => s + p.ovr, 0) / all.length;
    const age = (p: Player) => exactAge(p.birthDate, DATE);
    // Stars: the 50 best rated 78 or more. Average players: within 2 of the mean OVR, aged
    // 23-30, POT no more than 3 above OVR (no prospects).
    const stars = all
      .filter((p) => p.ovr >= 78)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 50);
    const average = all.filter(
      (p) => Math.abs(p.ovr - mean) <= 2 && age(p) >= 23 && age(p) <= 30 && p.pot - p.ovr <= 3,
    );
    expect(stars.length).toBeGreaterThanOrEqual(20);
    let checked = 0;
    for (const star of stars) {
      const cid = star.cid as number;
      // From each other club, its two best average players (the strongest pair it has).
      for (const club of world.clubs) {
        if (club.cid === cid) continue;
        const two = average
          .filter((p) => p.cid === club.cid)
          .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
          .slice(0, 2);
        if (two.length < 2) continue;
        const change = valueChange(
          world,
          day,
          cid,
          { pids: [star.pid], picks: [] },
          { pids: two.map((p) => p.pid), picks: [] },
        );
        expect(change.dv, `${star.lastName} (${star.ovr}) for two of ${club.name}`).toBeLessThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("values a pick less a draft further away, and less from a stronger original owner", () => {
    const view = clubView(world, 5, day);
    const pickOf = (season: number, round: number, cid: number) => {
      const pick = world.draftPicks.find(
        (p) => p.season === season && p.round === round && p.originalCid === cid,
      );
      if (!pick) throw new Error("No pick");
      return pick;
    };
    // The coming draft's picks and the two after it: 3 drafts.
    expect(new Set(world.draftPicks.map((p) => p.season))).toEqual(new Set([2026, 2027, 2028]));
    const bySlot = [...day.slots].sort((a, b) => a[1] - b[1]).map(([cid]) => cid);
    expect(bySlot).toHaveLength(48);
    for (const round of [1, 2]) {
      for (const season of [2026, 2027, 2028]) {
        const values = bySlot.map((cid) =>
          pickTradeValue(world, day, view, pickOf(season, round, cid)),
        );
        // The stronger the original owner (the later his slot), the less it's worth.
        for (let i = 1; i < values.length; i++) {
          expect(values[i]).toBeLessThanOrEqual(values[i - 1] as number);
        }
        expect(values[0]).toBeGreaterThan(values.at(-1) as number);
      }
      for (const cid of bySlot) {
        const [now, next, last] = [2026, 2027, 2028].map((s) =>
          pickTradeValue(world, day, view, pickOf(s, round, cid)),
        ) as [number, number, number];
        expect(now).toBeGreaterThan(next);
        expect(next).toBeGreaterThan(last);
      }
    }
    // Before a match: Blue's weakest has the first slot (the pool in odds order), Star's
    // strongest the last before the 6 promoted clubs (Blue's, then Gold's: its best is last).
    const byStrength = (league: string) =>
      world.clubs
        .filter((c) => c.leagueId === league)
        .map((c) => ({ cid: c.cid, s: clubStrength(world.players, c.cid, DATE) }))
        .sort((a, b) => b.s - a.s || a.cid - b.cid)
        .map((c) => c.cid);
    expect(day.slots.get(byStrength("BLUE").at(-1) as number)).toBe(1);
    expect(day.slots.get(byStrength("STAR")[0] as number)).toBe(42);
    expect(day.slots.get(byStrength("GOLD")[0] as number)).toBe(48);
    // A first-round pick is worth more than a second-round one from the same club.
    for (const cid of bySlot) {
      expect(pickTradeValue(world, day, view, pickOf(2026, 1, cid))).toBeGreaterThan(
        pickTradeValue(world, day, view, pickOf(2026, 2, cid)),
      );
    }
  });

  it("contending clubs value OVR now; rebuilding ones POT, youth and picks", () => {
    // In each league 2 to 6 contend (T: about 3 or 4), the strongest by their best 11.
    const strength = (cid: number) => {
      const top = seniors(cid)
        .slice(0, 11)
        .map((p) => p.ovr);
      return top.reduce((a, x) => a + x, 0) / top.length;
    };
    let contending = 0;
    for (const league of ["STAR", "GOLD", "BLUE"]) {
      const clubs = world.clubs.filter((c) => c.leagueId === league);
      const on = clubs.filter((c) => tradeState(day, c.cid) === "contending");
      const off = clubs.filter((c) => tradeState(day, c.cid) === "rebuilding");
      expect(on.length).toBeGreaterThanOrEqual(2);
      expect(on.length).toBeLessThanOrEqual(6);
      const weakest = Math.min(...on.map((c) => strength(c.cid)));
      expect(off.every((c) => strength(c.cid) <= weakest)).toBe(true);
      contending += on.length;
    }
    expect(contending).toBeGreaterThanOrEqual(6);
    expect(contending).toBeLessThanOrEqual(18);
    const young = { ovr: 62, pot: 80 };
    const prime = { ovr: 74, pot: 74 };
    const veteran = { ovr: 76, pot: 76 };
    // A rebuilding club prefers the 19-year-old to the 27-year-old; a contender the reverse.
    expect(talentValue(trades, young, 19, "rebuilding")).toBeGreaterThan(
      talentValue(trades, prime, 27, "rebuilding"),
    );
    expect(talentValue(trades, young, 19, "contending")).toBeLessThan(
      talentValue(trades, prime, 27, "contending"),
    );
    // A 32-year-old is worth more to a contender: over half as much again.
    expect(talentValue(trades, veteran, 32, "contending")).toBeGreaterThan(
      1.5 * talentValue(trades, veteran, 32, "rebuilding"),
    );
    // Picks: worth more to a rebuilding club.
    const pick = world.draftPicks.find((p) => p.season === 2026 && p.round === 1) as NonNullable<
      (typeof world.draftPicks)[0]
    >;
    const contender = world.clubs.find((c) => tradeState(day, c.cid) === "contending");
    const rebuilder = world.clubs.find((c) => tradeState(day, c.cid) === "rebuilding");
    expect(
      pickTradeValue(world, day, clubView(world, rebuilder?.cid ?? -1, day), pick),
    ).toBeGreaterThan(pickTradeValue(world, day, clubView(world, contender?.cid ?? -1, day), pick));
  });

  it("prices the contract: overpaid and final-year players are worth less", () => {
    const view = clubView(world, 20, day);
    const p = seniors(20)[3] as Player;
    const at = (wage: number, expires: string) =>
      playerTradeValue(trades, { ...p, contract: { wage, expires } }, view, day);
    const fair = at(p.contract?.wage ?? 0, "2029-06-30");
    expect(at(4 * (p.contract?.wage ?? 0), "2029-06-30")).toBeLessThan(fair);
    expect(at((p.contract?.wage ?? 0) / 4, "2029-06-30")).toBeGreaterThan(fair);
    // The longer a bad contract runs, the worse.
    expect(at(4 * (p.contract?.wage ?? 0), "2029-06-30")).toBeLessThan(
      at(4 * (p.contract?.wage ?? 0), "2028-06-30"),
    );
    // In his final year (ending 30 June 2027) he's worth less, more so to a rebuilding club.
    expect(at(p.contract?.wage ?? 0, "2027-06-30")).toBeLessThan(fair);
  });

  it("keeps room for the rookies of a club's picks in the coming draft", () => {
    const draft = config.competitions.draft;
    if (!draft) throw new Error("The Super League has a draft");
    const cid = 40;
    const slot = day.slots.get(cid) ?? 0;
    expect(rookieRoom(world, day, cid)).toBe(
      rookieWage(draft, slot) + rookieWage(draft, 48 + slot),
    );
    // A traded pick's rookie is its new holder's to pay.
    const first = world.draftPicks.find(
      (p) => p.season === 2026 && p.round === 1 && p.originalCid === cid,
    );
    if (!first) throw new Error("No pick");
    const traded = {
      ...world,
      draftPicks: world.draftPicks.map((p) => (p === first ? { ...p, cid: 41 } : p)),
    };
    expect(rookieRoom(traded, day, cid)).toBe(rookieWage(draft, 48 + slot));
    expect(rookieRoom(traded, day, 41)).toBe(rookieRoom(world, day, 41) + rookieWage(draft, slot));
  });

  it("a club over its cap values shedding wages; under it, a little", () => {
    const cid = 30;
    const club = world.clubs.find((c) => c.cid === cid);
    const p = seniors(cid)[12] as Player;
    const view = clubView(world, cid, day);
    expect(view.cap).toBeGreaterThan(0);
    const shed = (wage: number) => {
      const players = world.players.map((x) =>
        x.pid === p.pid ? { ...x, contract: { wage, expires: x.contract?.expires ?? "" } } : x,
      );
      return valueChange(
        { ...world, players },
        day,
        cid,
        { pids: [p.pid], picks: [] },
        {
          pids: [],
          picks: [],
        },
      ).salary;
    };
    const under = shed(1_000_000);
    // The same wage shed with the payroll far over the cap is worth more.
    const over = (() => {
      const players = world.players.map((x) =>
        x.cid === cid && x.contract
          ? { ...x, contract: { ...x.contract, wage: x.contract.wage * 2 } }
          : x,
      );
      const q = players.find((x) => x.pid === p.pid) as Player;
      if (q.contract) q.contract = { ...q.contract, wage: 1_000_000 };
      return valueChange(
        { ...world, players },
        day,
        cid,
        { pids: [p.pid], picks: [] },
        {
          pids: [],
          picks: [],
        },
      ).salary;
    })();
    expect(club).toBeDefined();
    expect(under).toBeGreaterThan(0);
    expect(over).toBeGreaterThan(2 * under);
  });
});
