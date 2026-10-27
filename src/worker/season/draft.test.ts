import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { ageOn } from "../../common/dates";
import { generateWorld } from "../generate/world";
import { Random } from "../core/random";
import {
  availableProspects,
  draftClassTurnover,
  draftOrder,
  draftPlayer,
  drawLottery,
  lotteryOddsNow,
  makePicks,
  missingPicks,
  nextPick,
  rookieWage,
  runDraft,
  setDraftOrder,
} from "./draft";
import { emptyLog, type LoopWorld, startingReputation } from "./offseason";
import { fullStrengthPlay } from "./play";
import { applyMoves, createSeason, playRest, seasonOutcome } from "./season";

const SLOW = { timeout: 120_000 };
const config = worlds.superLeague.competitions;
const draft = config.draft as NonNullable<typeof config.draft>;
const tiers = new Map(config.leagues.map((l) => [l.id, l.tier]));

// One Super League season, then its draft.
const generated = generateWorld({
  config: worlds.superLeague,
  seed: "draft-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const state = createSeason({
  config,
  season: 2026,
  seed: "draft-test",
  clubs: generated.clubs,
  lastFinish: new Map(),
  firstFid: 1,
});
playRest(state, fullStrengthPlay(generated.clubs, generated.players), config);
const outcome = seasonOutcome(state, config);
const at = (league: string, pos: number) => outcome.tables[league]?.[pos - 1]?.cid as number;

function world(): LoopWorld {
  let pid = Math.max(...generated.players.map((p) => p.pid)) + 1;
  const clubs = structuredClone(generated.clubs);
  applyMoves(clubs, outcome.moves);
  return {
    config: worlds.superLeague,
    clubs,
    players: structuredClone(generated.players),
    reputation: startingReputation(worlds.superLeague.clubs),
    clubSeasons: new Map(generated.clubSeasons.map((r) => [r.cid, r])),
    userCid: 0,
    seed: "draft-test",
    nextPid: () => pid++,
    draftPicks: structuredClone(generated.draftPicks),
  };
}

describe("the draft", () => {
  it("orders the pool, then reverse standings by tier, the promoted clubs last", SLOW, () => {
    const order = draftOrder(draft, outcome, tiers);
    expect(order).toHaveLength(48);
    expect(new Set(order).size).toBe(48);
    expect(order.slice(0, 8)).toEqual([
      at("BLUE", 16),
      at("BLUE", 15),
      at("BLUE", 14),
      at("BLUE", 13),
      at("GOLD", 16),
      at("GOLD", 15),
      at("STAR", 16),
      at("STAR", 15),
    ]);
    const promoted = outcome.moves.filter((m) => m.reason !== "relegated").map((m) => m.cid);
    expect(new Set(order.slice(44))).toEqual(new Set(promoted));
    // Blue's promoted clubs pick before Gold's; each tier from the bottom of its table.
    const tierOf = (cid: number) => outcome.moves.find((m) => m.cid === cid)?.from ?? "";
    expect(order.slice(44).map(tierOf)).toEqual(["BLUE", "BLUE", "GOLD", "GOLD"]);
    const middle = order.slice(8, 44);
    const league = (cid: number) =>
      Object.entries(outcome.tables).find(([, t]) => t.some((r) => r.cid === cid))?.[0];
    const firstGold = middle.findIndex((cid) => league(cid) === "GOLD");
    const firstStar = middle.findIndex((cid) => league(cid) === "STAR");
    expect(middle.slice(0, firstGold).every((cid) => league(cid) === "BLUE")).toBe(true);
    expect(middle.slice(firstGold, firstStar).every((cid) => league(cid) === "GOLD")).toBe(true);
    expect(middle.at(-1)).toBe(at("STAR", 1));
  });

  it("draws the lottery to the config's odds over many draws", () => {
    const odds = draft.lotteryPool.map((s) => s.odds);
    const rng = Random.fromSeed("lottery-test");
    const firsts = odds.map(() => 0);
    const N = 50_000;
    for (let i = 0; i < N; i++) {
      const order = drawLottery(odds, draft.lotteryPicks, rng);
      expect(new Set(order).size).toBe(8);
      // Picks 5–8: the clubs not drawn, in odds order.
      const rest = order.slice(draft.lotteryPicks);
      expect(rest).toEqual([...rest].sort((a, b) => a - b));
      firsts[order[0] as number] = (firsts[order[0] as number] ?? 0) + 1;
    }
    const total = odds.reduce((a, b) => a + b, 0);
    odds.forEach((o, i) => {
      expect(Math.abs((firsts[i] ?? 0) / N - o / total)).toBeLessThan(0.01);
    });
  });

  it("draws the pool's first picks in a draft and shows today's odds", SLOW, () => {
    const order = draftOrder(draft, outcome, tiers, Random.fromSeed("order-test"));
    const pool = draftOrder(draft, outcome, tiers).slice(0, 8);
    expect(new Set(order.slice(0, 8))).toEqual(new Set(pool));
    expect(order.slice(8)).toEqual(draftOrder(draft, outcome, tiers).slice(8));
    const tables = Object.fromEntries(
      Object.entries(outcome.tables).map(([id, rows]) => [id, rows.map((r) => r.cid)]),
    );
    const odds = lotteryOddsNow(draft, tables);
    expect(odds.size).toBe(8);
    expect(odds.get(at("BLUE", 16))).toBe(20);
    expect(odds.get(at("STAR", 15))).toBe(7);
    expect(odds.get(at("BLUE", 12))).toBeUndefined();
  });

  it("on 1 July frees last June's undrafted and brings the class two seasons on", SLOW, () => {
    const w = world();
    runDraft(w, outcome, 2026, "2027-06-15");
    const log = draftClassTurnover(w, 2027, "2027-07-01");
    expect(log.added).toHaveLength(110);
    expect(log.added.every((p) => p.draftSeason === 2029 && p.status === "prospect")).toBe(true);
    expect(w.players.filter((p) => p.draftSeason === 2026)).toEqual([]);
    expect(log.changed.size).toBe(14);
    for (const s of [2027, 2028, 2029]) {
      expect(w.players.filter((p) => p.draftSeason === s)).toHaveLength(110);
    }
  });

  it("makes every club's own picks for the coming draft and two more", () => {
    const picks = generated.draftPicks;
    expect(picks).toHaveLength(48 * 2 * 3);
    expect([...new Set(picks.map((p) => p.season))]).toEqual([2026, 2027, 2028]);
    expect(picks.every((p) => p.cid === p.originalCid)).toBe(true);
    // Only missing ones are made: a traded pick stays with its owner.
    const traded = picks.map((p) => (p.originalCid === 5 ? { ...p, cid: 6 } : p));
    expect(missingPicks(draft, generated.clubs, traded, 2026, 2028)).toEqual([]);
    expect(missingPicks(draft, generated.clubs, traded, 2027, 2029)).toHaveLength(96);
  });

  it("numbers the picks on the lottery's day, then picks to the user's turn", SLOW, () => {
    const w = world(); // the user's club: 0
    expect(setDraftOrder(w, outcome, 2026, "2027-06-05").added).toEqual([]);
    const numbered = (w.draftPicks ?? []).filter((p) => p.season === 2026);
    expect(numbered.map((p) => p.pick).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      Array.from({ length: 96 }, (_, i) => i + 1),
    );
    const mine = numbered
      .filter((p) => p.cid === 0)
      .map((p) => p.pick ?? 0)
      .sort((a, b) => a - b);
    expect(mine).toHaveLength(2);
    // The AI picks up to his turn, then stops.
    makePicks(w, 2026, "2027-06-15", true);
    const dp = nextPick(w.draftPicks ?? [], 2026);
    expect(dp?.pick).toBe(mine[0]);
    expect(w.players.filter((p) => p.draft?.season === 2026)).toHaveLength((mine[0] ?? 0) - 1);
    // He picks the weakest prospect left (not the AI's choice); the AI finishes, his
    // second pick too.
    const left = availableProspects(w.players, 2026);
    const weakest = left.reduce((a, b) => (b.ovr < a.ovr ? b : a));
    if (dp) draftPlayer(w, dp, weakest, "2027-06-15", emptyLog());
    expect(weakest.draft).toEqual({
      season: 2026,
      round: 1,
      pick: mine[0],
      cid: 0,
      originalCid: 0,
    });
    makePicks(w, 2026, "2027-06-15", false);
    expect(nextPick(w.draftPicks ?? [], 2026)).toBeNull();
    expect(w.players.filter((p) => p.draft?.season === 2026)).toHaveLength(96);
    expect(w.players.find((p) => p.draft?.pick === mine[1])?.cid).toBe(0);
  });

  it("gives a traded pick's owner the original club's slot, lottery included", SLOW, () => {
    const blueLast = at("BLUE", 16);
    const champion = at("STAR", 1);
    const own = world();
    runDraft(own, outcome, 2026, "2027-06-15");
    const slotOf = (w: LoopWorld, cid: number, round: number) =>
      w.players.find((p) => p.draft?.cid === cid && p.draft.round === round)?.draft?.pick;
    const slot = slotOf(own, blueLast, 1);
    expect(slot).toBeLessThanOrEqual(8);

    const w = world();
    const pick = w.draftPicks?.find(
      (p) => p.season === 2026 && p.round === 1 && p.originalCid === blueLast,
    );
    if (pick) pick.cid = champion;
    const later = w.draftPicks?.find(
      (p) => p.season === 2028 && p.round === 2 && p.originalCid === blueLast,
    );
    if (later) later.cid = champion;
    runDraft(w, outcome, 2026, "2027-06-15");
    const drafted = (cid: number) => w.players.filter((p) => p.draft?.cid === cid);
    expect(drafted(champion)).toHaveLength(3);
    expect(drafted(blueLast)).toHaveLength(1);
    expect(drafted(champion).some((p) => p.draft?.round === 1 && p.draft.pick === slot)).toBe(true);
    // The draft used its picks up; the later ones wait, the traded one with its owner.
    expect(w.draftPicks?.some((p) => p.season === 2026)).toBe(false);
    expect(w.draftPicks).toHaveLength(48 * 2 * 2);
    // 1 July: the picks of the draft two seasons on.
    draftClassTurnover(w, 2027, "2027-07-01");
    expect(w.draftPicks).toHaveLength(48 * 2 * 3);
    expect([...new Set(w.draftPicks?.map((p) => p.season))].sort()).toEqual([2027, 2028, 2029]);
    expect(w.draftPicks?.find((p) => p === later)?.cid).toBe(champion);
    expect(
      w.draftPicks?.filter((p) => p.season === 2029).every((p) => p.cid === p.originalCid),
    ).toBe(true);
  });

  it("pays rookies by pick, interpolating the config's points", () => {
    expect(rookieWage(draft, 1)).toBe(2_500_000);
    expect(rookieWage(draft, 48)).toBe(800_000);
    expect(rookieWage(draft, 96)).toBe(400_000);
    expect(rookieWage(draft, 24)).toBeLessThan(rookieWage(draft, 2));
    expect(rookieWage(draft, 24)).toBeGreaterThan(800_000);
  });

  it("picks from the class: two rookies a club on 3-year contracts, the rest wait", SLOW, () => {
    const w = world();
    const log = runDraft(w, outcome, 2026, "2027-06-15");
    // The class has been there since 1 July (generated with the world).
    expect(log.added).toEqual([]);
    const rookies = w.players.filter((p) => log.changed.has(p.pid));
    expect(rookies).toHaveLength(96);
    expect(rookies.every((p) => p.status === "club")).toBe(true);
    for (const club of w.clubs) expect(rookies.filter((p) => p.cid === club.cid)).toHaveLength(2);
    expect(w.players.filter((p) => p.draftSeason === 2026)).toHaveLength(14);
    // The next two seasons' classes wait for their drafts.
    expect(w.players.filter((p) => p.draftSeason === 2027)).toHaveLength(110);
    expect(w.players.filter((p) => p.draftSeason === 2028)).toHaveLength(110);
    expect(rookies.every((p) => p.contract?.expires === "2030-06-30")).toBe(true);
    const first = rookies.find((p) => p.draft?.pick === 1);
    // Pick 1 went to a club of the lottery pool.
    const pool = draftOrder(draft, outcome, tiers).slice(0, 8);
    expect(first?.draft).toMatchObject({ season: 2026, round: 1, pick: 1 });
    expect(pool).toContain(first?.draft?.cid);
    expect(first?.contract?.wage).toBe(2_500_000);
    expect(log.transactions.filter((t) => t.type === "draft")).toHaveLength(96);
    const ages = rookies.map((p) => ageOn(p.birthDate, "2027-06-15"));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(17);
    expect(Math.max(...ages)).toBeLessThanOrEqual(19);
    // The same season's draft is the same draft.
    const w2 = world();
    runDraft(w2, outcome, 2026, "2027-06-15");
    const picks = (ws: typeof w) =>
      ws.players.filter((p) => p.draft).map((p) => [p.pid, p.cid, p.draft?.pick]);
    expect(picks(w2)).toEqual(picks(w));
  });
});
