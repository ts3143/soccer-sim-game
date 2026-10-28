import { describe, expect, it } from "vitest";
import { worlds, type WorldConfig } from "../../common/config/worlds";
import { addDays } from "../../common/dates";
import type { DraftPick } from "../../common/schema";
import { preseasonBoard } from "../club/board";
import { generateWorld } from "../generate/world";
import { AREA, type LoopWorld, startingReputation } from "../season/offseason";
import { createSeason } from "../season/season";
import { aiTradeDay, tradeDays } from "./aiTrades";
import { tradeCalendar } from "./trades";
import { tradeDay, valueChange } from "./tradeValue";

const base = worlds.superLeague;
const trades = base.competitions.trades;
if (!trades) throw new Error("The Super League has trades");
// One attempt a day, so each trade can be checked against the world just before it.
const config: WorldConfig = {
  ...base,
  competitions: {
    ...base.competitions,
    trades: { ...trades, ai: { ...trades.ai, attemptsPerDay: 1 } },
  },
};
const SEED = "ai-trades-test";
const DATE = "2026-07-01";
const generated = generateWorld({
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
  clubs: generated.clubs,
  lastFinish: new Map(),
  firstFid: 1,
});
const cal = tradeCalendar(config.competitions, 2026, state.fixtures);

function world(worldConfig = config): LoopWorld & { draftPicks: DraftPick[] } {
  const w = {
    config: worldConfig,
    clubs: structuredClone(generated.clubs),
    players: structuredClone(generated.players),
    reputation: startingReputation(worldConfig.clubs),
    clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
    userCid: 0,
    seed: SEED,
    nextPid: () => 0,
    draftPicks: structuredClone(generated.draftPicks),
  };
  preseasonBoard(w, 2026, DATE, worldConfig.competitions);
  return w;
}

describe("AI-to-AI trades", () => {
  it("trade on a day a week from 8 July to the roster deadline", () => {
    const days = tradeDays(trades, cal);
    expect(days[0]).toBe("2026-07-08");
    expect(days.every((d, i) => i === 0 || d === addDays(days[i - 1] as string, 7))).toBe(true);
    expect((days.at(-1) as string) <= (cal.deadline as string)).toBe(true);
    expect(addDays(days.at(-1) as string, 7) > (cal.deadline as string)).toBe(true);
  });

  it("make trades both clubs gain by, by the rules, the user's club left out", () => {
    const w = world();
    let made = 0;
    for (const date of tradeDays(trades, cal).slice(0, 12)) {
      const before = structuredClone({ players: w.players, picks: w.draftPicks });
      const log = aiTradeDay(w, 2026, date, cal);
      for (const t of log.transactions) {
        made++;
        const [a, b] = t.cids as [number, number];
        expect(a).not.toBe(0);
        expect(b).not.toBe(0);
        // Each side as it was: who held what before, and where it went.
        const side = (from: number, to: number) => ({
          pids: before.players
            .filter((p) => p.cid === from && w.players.find((q) => q.pid === p.pid)?.cid === to)
            .map((p) => p.pid),
          picks: before.picks.filter(
            (p) =>
              p.cid === from &&
              w.draftPicks.find(
                (q) =>
                  q.season === p.season && q.round === p.round && q.originalCid === p.originalCid,
              )?.cid === to,
          ),
        });
        const aGives = side(a, b);
        const bGives = side(b, a);
        expect([...aGives.pids, ...bGives.pids].sort()).toEqual([...t.pids].sort());
        const was = { ...w, players: before.players, draftPicks: before.picks };
        const day = tradeDay(was, 2026, date);
        expect(valueChange(was, day, a, aGives, bGives).dv).toBeGreaterThan(0);
        expect(valueChange(was, day, b, bGives, aGives).dv).toBeGreaterThan(0);
        // Both keep two keepers.
        for (const cid of [a, b]) {
          const keepers = w.players.filter(
            (p) => p.cid === cid && p.status === "club" && AREA[p.position] === "gk",
          );
          expect(keepers.length).toBeGreaterThanOrEqual(2);
        }
        // Moved players have their trade in their history.
        for (const pid of t.pids) {
          expect(w.players.find((p) => p.pid === pid)?.transfers.at(-1)).toMatchObject({
            type: "trade",
            date,
          });
        }
      }
    }
    expect(made).toBeGreaterThan(2);
    // Nobody traded on within 90 days of a trade.
    for (const p of w.players) {
      const traded = p.transfers.filter((x) => x.type === "trade").map((x) => x.date);
      for (let i = 1; i < traded.length; i++) {
        expect(addDays(traded[i - 1] as string, 90) < (traded[i] as string)).toBe(true);
      }
    }
  });

  it("are the same for the same seed, and don't happen while trades are closed", () => {
    const date = tradeDays(trades, cal)[3] as string;
    const one = world();
    const two = world();
    expect(aiTradeDay(one, 2026, date, cal).transactions).toEqual(
      aiTradeDay(two, 2026, date, cal).transactions,
    );
    const closed = addDays(cal.deadline as string, 7);
    const w = world();
    const players = structuredClone(w.players);
    expect(aiTradeDay(w, 2026, closed, cal).transactions).toEqual([]);
    expect(w.players).toEqual(players);
  });
});
