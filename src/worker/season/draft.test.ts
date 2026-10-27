import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import { ageOn } from "../../common/dates";
import { generateWorld } from "../generate/world";
import { draftOrder, rookieWage, runDraft } from "./draft";
import { type LoopWorld, startingReputation } from "./offseason";
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
    expect(w.players.filter((p) => p.status === "prospect")).toHaveLength(14);
    expect(rookies.every((p) => p.contract?.expires === "2030-06-30")).toBe(true);
    const first = rookies.find((p) => p.draft?.pick === 1);
    expect(first?.draft).toEqual({ season: 2026, round: 1, pick: 1, cid: at("BLUE", 16) });
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
