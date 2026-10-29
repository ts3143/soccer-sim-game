import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { addDays } from "../../common/dates";
import type { Player } from "../../common/schema";
import { preseasonBoard } from "../club/board";
import { generateWorld } from "../generate/world";
import { type LoopWorld, startingReputation } from "../season/offseason";
import { createSeason } from "../season/season";
import { describeTransaction } from "../views/common";
import {
  aiAccepts,
  applyTrade,
  bestOffer,
  makeItWork,
  noAssets,
  type Trade,
  tradeCalendar,
  tradeProblems,
  tradesClosed,
  tradeValueFor,
} from "./trades";
import { tradeDay, type TradeWorld } from "./tradeValue";

const config = worlds.superLeague;
const SEED = "trades-test";
const DATE = "2026-07-01";
const sl = generateWorld({
  config,
  seed: SEED,
  name: "t",
  userCid: 0,
  createdAt: `${DATE}T00:00:00.000Z`,
});
const state = createSeason({
  config: config.competitions,
  season: 2026,
  seed: SEED,
  clubs: sl.clubs,
  lastFinish: new Map(),
  firstFid: 1,
});
const cal = tradeCalendar(config.competitions, 2026, state.fixtures);

function world(): LoopWorld & TradeWorld {
  const w = {
    config,
    clubs: structuredClone(sl.clubs),
    players: structuredClone(sl.players),
    reputation: startingReputation(config.clubs),
    clubSeasons: new Map(structuredClone(sl.clubSeasons).map((r) => [r.cid, r])),
    userCid: 0,
    seed: SEED,
    nextPid: () => 0,
    draftPicks: structuredClone(sl.draftPicks),
  };
  preseasonBoard(w, 2026, DATE, config.competitions);
  return w;
}
const squad = (w: LoopWorld, cid: number) =>
  w.players
    .filter((p) => p.cid === cid && p.status === "club")
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
const give = (pids: number[], picks: Trade["aGives"]["picks"] = []) => ({ pids, picks });

describe("trades", () => {
  it("are open from 1 July to the roster deadline, then from the end of the play-offs", () => {
    const { deadline, seasonEnd, firstMatch } = cal;
    if (!deadline || !seasonEnd || !firstMatch) throw new Error("A full season");
    expect(deadline < seasonEnd && firstMatch < deadline).toBe(true);
    expect(tradesClosed(cal, DATE)).toBeNull();
    expect(tradesClosed(cal, deadline)).toBeNull();
    expect(tradesClosed(cal, addDays(deadline, 1))).toMatch(/closed from the roster deadline/);
    expect(tradesClosed(cal, seasonEnd)).not.toBeNull();
    expect(tradesClosed(cal, addDays(seasonEnd, 1))).toBeNull();
    expect(tradesClosed(cal, "2027-06-30")).toBeNull();
  });

  it("checks what can be traded: own players and picks, no prospects, no final years once over", () => {
    const w = world();
    const [a, b] = [squad(w, 1), squad(w, 2)];
    const ok: Trade = {
      a: 1,
      b: 2,
      aGives: give([a[5]?.pid ?? -1]),
      bGives: give([b[5]?.pid ?? -1]),
    };
    expect(tradeProblems(w, cal, DATE, ok)).toEqual([]);
    const notHis = { ...ok, aGives: give([b[6]?.pid ?? -1]) };
    expect(tradeProblems(w, cal, DATE, notHis)[0]).toMatch(/can't trade a player not in its squad/);
    const prospect = w.players.find((p) => p.status === "prospect") as Player;
    expect(tradeProblems(w, cal, DATE, { ...ok, aGives: give([prospect.pid]) })).toHaveLength(1);
    expect(
      tradeProblems(w, cal, DATE, { a: 1, b: 2, aGives: noAssets(), bGives: noAssets() }),
    ).toEqual(["Nothing changes hands."]);
    // Picks: only a club's own (any of its three drafts), each once.
    const own = w.draftPicks.find((p) => p.cid === 1 && p.season === 2028) as NonNullable<
      (typeof w.draftPicks)[0]
    >;
    const theirs = w.draftPicks.find((p) => p.cid === 2) as typeof own;
    const pickOnly = (picks: (typeof own)[]): Trade => ({
      ...ok,
      aGives: give([], picks),
      bGives: noAssets(),
    });
    expect(tradeProblems(w, cal, DATE, pickOnly([own]))).toEqual([]);
    expect(tradeProblems(w, cal, DATE, pickOnly([theirs]))[0]).toMatch(
      /doesn't hold that 20\d\d round \d pick/,
    );
    expect(tradeProblems(w, cal, DATE, pickOnly([own, own]))).toContain("A pick is in twice.");
    // A final-year player (his contract ends 30 June 2027) until the season ends, not after.
    const ending = a.find((p) => p.contract?.expires === "2027-06-30") as Player;
    const trade = { ...ok, aGives: give([ending.pid]) };
    expect(tradeProblems(w, cal, DATE, trade)).toEqual([]);
    const after = addDays(cal.seasonEnd as string, 1);
    expect(tradeProblems(w, cal, after, trade)).toEqual([
      expect.stringMatching(/whose contract ends on 30 June/),
    ]);
  });

  it("keeps squads within 25 once the limit counts, and over the cap matches wages", () => {
    const w = world();
    // Both clubs well under their caps, so wages don't get in the way at first.
    for (const p of w.players) if ((p.cid === 1 || p.cid === 2) && p.contract) p.contract.wage /= 2;
    // Club 1 at 25: taking two for one is fine before the first match, not after it.
    const free = w.players.filter((p) => p.status === "freeAgent");
    for (const p of free.splice(0, 25 - squad(w, 1).length)) {
      Object.assign(p, {
        status: "club",
        cid: 1,
        contract: { wage: 300_000, expires: "2028-06-30" },
      });
    }
    expect(squad(w, 1)).toHaveLength(25);
    const [a, b] = [squad(w, 1), squad(w, 2)];
    const twoForOne: Trade = {
      a: 1,
      b: 2,
      aGives: give([a[24]?.pid ?? -1]),
      bGives: give([b[20]?.pid ?? -1, b[21]?.pid ?? -1]),
    };
    expect(tradeProblems(w, cal, DATE, twoForOne)).toEqual([]);
    const inSeason = cal.firstMatch as string;
    expect(tradeProblems(w, cal, inSeason, twoForOne)).toEqual([
      expect.stringMatching(/would have 26 players, over the limit of 25/),
    ]);
    // Over its cap, club 1 can take back at most 125% of the wages it sends.
    for (const p of a) if (p.contract) p.contract.wage *= 3;
    const cheap = a.at(-1) as Player;
    const dear = b[0] as Player;
    const swap: Trade = { a: 1, b: 2, aGives: give([cheap.pid]), bGives: give([dear.pid]) };
    if ((dear.contract?.wage ?? 0) <= 1.25 * (cheap.contract?.wage ?? 0)) {
      throw new Error("The test needs a dearer player");
    }
    expect(tradeProblems(w, cal, DATE, swap)).toEqual([
      expect.stringMatching(/would end over the cap: over it, a club takes back at most 125%/),
    ]);
    // Shedding wages is fine over the cap: club 1 sends him away for nothing.
    expect(tradeProblems(w, cal, DATE, { ...swap, bGives: noAssets() })).toEqual([]);
  });

  it("moves players with their contracts and picks to their new owners", () => {
    const w = world();
    const p = squad(w, 1)[3] as Player;
    const q = squad(w, 2)[4] as Player;
    const pick = w.draftPicks.find((x) => x.cid === 2 && x.season === 2027 && x.round === 1);
    if (!pick) throw new Error("No pick");
    const contract = structuredClone(p.contract);
    const { changed, transaction } = applyTrade(w, 2026, DATE, {
      a: 1,
      b: 2,
      aGives: give([p.pid]),
      bGives: give([q.pid], [pick]),
    });
    expect([p.cid, q.cid, pick.cid]).toEqual([2, 1, 1]);
    expect(p.contract).toEqual(contract);
    expect(p.transfers.at(-1)).toMatchObject({ type: "trade", fromCid: 1, toCid: 2, fee: 0 });
    expect(squad(w, 2).filter((x) => x.shirtNumber === p.shirtNumber)).toHaveLength(1);
    expect([...changed].sort()).toEqual([p.pid, q.pid].sort());
    const name = (cid: number) => w.clubs.find((c) => c.cid === cid)?.name;
    const full = (x: Player) => `${x.firstName} ${x.lastName}`.trim();
    expect(describeTransaction(transaction)).toBe(
      `${name(1)} and ${name(2)} trade: ${name(1)} get ${full(q)}, 2028 round 1 pick; ${name(2)} get ${full(p)}`,
    );
  });

  it("the AI says yes when it gains; asked what would make it work, it names what it wants", () => {
    const w = world();
    const day = tradeDay(w, 2026, DATE);
    const star = squad(w, 30)[0] as Player;
    // The user's club 0 asks for club 30's best player and offers nothing.
    const ask: Trade = { a: 0, b: 30, aGives: noAssets(), bGives: give([star.pid]) };
    expect(aiAccepts(tradeValueFor(w, day, ask, 30))).toBe(false);
    const worked = makeItWork(w, day, cal, ask, 30, 4);
    if (!worked) throw new Error("Club 0 has enough to offer");
    const added = worked.aGives.pids.length + worked.aGives.picks.length;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(4);
    expect(worked.bGives).toEqual(ask.bGives);
    expect(tradeProblems(w, cal, DATE, worked)).toEqual([]);
    expect(aiAccepts(tradeValueFor(w, day, worked, 30))).toBe(true);
    // A trade it would already take comes back as it is; with nothing to add, no deal.
    expect(makeItWork(w, day, cal, worked, 30, 4)).toEqual(worked);
    expect(makeItWork(w, day, cal, ask, 30, 0)).toBeNull();
  });

  it("builds the best offer a club would make for what another puts up", () => {
    const w = world();
    const day = tradeDay(w, 2026, DATE);
    // Club 0 puts up a young player; club 30 adds what's worth most to club 0, still gaining.
    const young = squad(w, 0).find((p) => p.pot - p.ovr >= 8) as Player;
    const put: Trade = { a: 0, b: 30, aGives: give([young.pid]), bGives: noAssets() };
    expect(aiAccepts(tradeValueFor(w, day, put, 30))).toBe(true);
    const offer = bestOffer(w, day, cal, put, 30, 4);
    const added = offer.bGives.pids.length + offer.bGives.picks.length;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(4);
    expect(offer.aGives).toEqual(put.aGives);
    expect(tradeProblems(w, cal, DATE, offer)).toEqual([]);
    expect(aiAccepts(tradeValueFor(w, day, offer, 30))).toBe(true);
    expect(tradeValueFor(w, day, offer, 0).dv).toBeGreaterThan(tradeValueFor(w, day, put, 0).dv);
    // Nothing more to add: it stays as it is.
    expect(bestOffer(w, day, cal, put, 30, 0)).toEqual(put);
  });
});
