import { describe, expect, it } from "vitest";
import type { Club, Player } from "../../common/schema";
import { developHalfSeason } from "../core/development";
import { Random } from "../core/random";
import { generateWorld } from "../generate/world";
import { startingReputation, type LoopWorld } from "../season/offseason";
import { runDays } from "../season/runner";
import { createSeason } from "../season/season";
import { marketDay, marketDays } from "./aiMarket";
import { lendable, LOANS, loanEnd, returnLoans, startLoan } from "./loans";
import { seniorsOf, squadCost } from "./transfers";

const SEED = "loan-test";
const generated = generateWorld({
  seed: SEED,
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
function freshWorld(): LoopWorld {
  const players = structuredClone(generated.players);
  let pid = Math.max(...players.map((p) => p.pid)) + 1;
  return {
    clubs: structuredClone(generated.clubs),
    players,
    reputation: startingReputation(),
    clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
    userCid: 0,
    seed: SEED,
    nextPid: () => pid++,
  };
}
const eng1 = (w: LoopWorld) =>
  w.clubs.filter((c) => c.leagueId === "ENG1").sort((a, b) => b.strengthTarget - a.strengthTarget);
const JULY = "2026-07-01";

describe("loans", () => {
  it("run to 1 January (half, from the summer) or to the season's end", () => {
    expect(loanEnd(2026, "2026-07-20", "half")).toBe("2027-01-01");
    expect(loanEnd(2026, "2026-07-20", "season")).toBe("2027-06-30");
    expect(loanEnd(2026, "2027-01-10", "half")).toBe("2027-06-30");
  });

  it("move the player and split his wage; he comes back when the loan ends", () => {
    const w = freshWorld();
    const [parent, , , loanClub] = eng1(w) as [Club, Club, Club, Club];
    const p = seniorsOf(w.players, parent.cid)[15] as Player;
    const wage = p.contract?.wage ?? 0;
    const cost = [parent, loanClub].map((c) => squadCost(w.players, c.cid).wages);
    const log = startLoan(w, {
      pid: p.pid,
      toCid: loanClub.cid,
      until: "2027-01-01",
      wageShare: 0.5,
      date: JULY,
      season: 2026,
    });
    expect(p).toMatchObject({ status: "loan", cid: loanClub.cid, loan: { parentCid: parent.cid } });
    expect(log.transactions[0]).toMatchObject({ type: "loan", cids: [parent.cid, loanClub.cid] });
    expect(squadCost(w.players, parent.cid).wages).toBeCloseTo((cost[0] ?? 0) - wage / 2, 0);
    expect(squadCost(w.players, loanClub.cid).wages).toBeCloseTo((cost[1] ?? 0) + wage / 2, 0);
    expect(seniorsOf(w.players, loanClub.cid).some((x) => x.pid === p.pid)).toBe(true);

    expect(returnLoans(w, "2026-12-31", 2026).changed.size).toBe(0);
    const back = returnLoans(w, "2027-01-01", 2027);
    expect(back.changed.has(p.pid)).toBe(true);
    expect(p).toMatchObject({ status: "club", cid: parent.cid, loan: null });
    expect(p.transfers.at(-1)).toMatchObject({ type: "loan", toCid: parent.cid });
  });

  it("lists only young prospects outside the best 16, and a parent keeps 20 seniors", () => {
    const w = freshWorld();
    const club = eng1(w)[0] as Club;
    const squad = seniorsOf(w.players, club.cid);
    for (const [i, p] of squad.entries()) {
      if (lendable(w, p, JULY)) {
        expect(i).toBeGreaterThanOrEqual(LOANS.fromRank);
        expect(2026 - Number(p.birthDate.slice(0, 4))).toBeLessThanOrEqual(LOANS.maxAge + 1);
      }
    }
    const starter = squad[0] as Player;
    expect(lendable(w, starter, JULY)).toBe(false);
    const few = {
      ...w,
      players: w.players.filter((p) => p.cid !== club.cid || squad.indexOf(p) < 20),
    };
    for (const p of seniorsOf(few.players, club.cid)) expect(lendable(few, p, JULY)).toBe(false);
  });

  it("keep a loanee out of matches against his parent club", { timeout: 60_000 }, () => {
    const w = freshWorld();
    const clubs = eng1(w);
    const parent = clubs[0] as Club;
    const loanClub = clubs.at(-1) as Club;
    // A strong player for a weak club: he starts there whenever he may.
    const p = seniorsOf(w.players, parent.cid)[11] as Player;
    startLoan(w, {
      pid: p.pid,
      toCid: loanClub.cid,
      until: "2027-06-30",
      wageShare: 0.5,
      date: JULY,
      season: 2026,
    });
    const state = createSeason({
      season: 2026,
      seed: SEED,
      clubs: w.clubs,
      lastFinish: new Map(),
      firstFid: 1,
    });
    const days = runDays(w, state, JULY, { limit: "2027-01-31" });
    const appeared = (fixture: { homeCid: number; awayCid: number }) =>
      days.played.find(
        (m) => m.fixture === fixture && m.result.players.some((s) => s.pid === p.pid),
      ) !== undefined;
    const meetings = days.played.filter(
      (m) =>
        [m.fixture.homeCid, m.fixture.awayCid].includes(parent.cid) &&
        [m.fixture.homeCid, m.fixture.awayCid].includes(loanClub.cid),
    );
    expect(meetings.length).toBeGreaterThan(0);
    for (const m of meetings) expect(appeared(m.fixture)).toBe(false);
    const forLoanClub = days.played.filter(
      (m) => m.fixture.homeCid === loanClub.cid || m.fixture.awayCid === loanClub.cid,
    );
    expect(forLoanClub.filter((m) => appeared(m.fixture)).length).toBeGreaterThan(5);
  });

  it("don't beat playing at his level by playing a level far below (weak-loan exploit)", () => {
    const p = generated.players.find(
      (x) => x.status === "club" && x.ovr >= 60 && x.ovr <= 64 && x.pot >= x.ovr + 8,
    ) as Player;
    const growth = (levelStrength: number, minutesShare: number) => {
      let total = 0;
      for (let i = 0; i < 300; i++) {
        const next = developHalfSeason(
          p.ratingsHistory.at(-1)?.ratings ?? [],
          {
            age: 19.5,
            curve: "normal",
            ceiling: p.ovr + 15,
            ovr: p.ovr,
            coaching: 1,
            medical: 1,
            minutesShare,
            levelStrength,
            performanceAdj: 0,
            academyYouth: null,
          },
          Random.fromSeed(`exploit/${i}`),
        );
        total += next.reduce((s, r) => s + r, 0) / next.length;
      }
      return total / 300;
    };
    const atLevel = growth(p.ovr + 2, 0.9);
    const farBelow = growth(p.ovr - 12, 0.9);
    const benched = growth(p.ovr + 10, 0.05);
    expect(farBelow).toBeLessThan(atLevel);
    expect(atLevel).toBeGreaterThan(benched);
  });

  it("are made by the AI for young players who'd play elsewhere, never for the user's club", () => {
    const w = freshWorld();
    const summer = marketDays(2026).filter((d) => d.window === "summer");
    const loans = summer
      .flatMap((d) => marketDay(w, 2026, d).transactions)
      .filter((t) => t.type === "loan");
    expect(loans.length).toBeGreaterThan(0);
    for (const t of loans) {
      const p = w.players.find((x) => x.pid === t.pids[0]) as Player;
      expect(t.cids).not.toContain(0);
      expect(p.status).toBe("loan");
      expect(p.loan).toMatchObject({ parentCid: t.cids[0], until: "2027-06-30", wageShare: 0.5 });
      expect(2026 - Number(p.birthDate.slice(0, 4))).toBeLessThanOrEqual(LOANS.maxAge + 1);
    }
  });
});
