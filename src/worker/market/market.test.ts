import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, ClubSeason, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import {
  contractAsks,
  contractEnd,
  marketValue,
  marketWage,
  playerMood,
  preferredYears,
  signContract,
  yearsLeft,
} from "./market";
import { aiRenewals, contractWarning, expireContracts, type ContractWorld } from "./renewals";

const generated = generateWorld({
  config: worlds.classic,
  seed: "market-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const DATE = "2026-07-01";
const someone = (edit: Partial<Player> = {}): Player => ({
  ...structuredClone(generated.players.find((p) => p.status === "club") as Player),
  ...edit,
});
const freshWorld = (): ContractWorld => ({
  clubs: structuredClone(generated.clubs),
  players: structuredClone(generated.players),
  clubSeasons: new Map(structuredClone(generated.clubSeasons).map((r) => [r.cid, r])),
  userCid: 0,
});

describe("market value", () => {
  it("rises steeply with OVR, credits young players' potential, and falls with age", () => {
    const base = someone({ birthDate: "1999-01-01", ovr: 70, pot: 70 });
    expect(marketValue({ ...base, ovr: 80, pot: 80 }, DATE)).toBeGreaterThan(
      4 * marketValue(base, DATE),
    );
    const young = { ...base, birthDate: "2006-01-01", pot: 82 };
    expect(marketValue(young, DATE)).toBeGreaterThan(marketValue(base, DATE));
    const veteran = { ...base, birthDate: "1991-01-01" };
    expect(marketValue(veteran, DATE)).toBeLessThan(marketValue(base, DATE));
  });

  it("is cheap with one year left and lower in a weaker league", () => {
    const p = someone({
      ovr: 70,
      pot: 70,
      birthDate: "1999-01-01",
      contract: { wage: 1e6, expires: "2030-06-30" },
    });
    const lastYear = { ...p, contract: { wage: 1e6, expires: "2027-06-30" } };
    expect(yearsLeft(lastYear, DATE)).toBe(1);
    expect(marketValue(lastYear, DATE)).toBeLessThan(0.7 * marketValue(p, DATE));
    expect(marketValue(p, DATE, 62)).toBeLessThan(marketValue(p, DATE, 70));
  });
});

describe("wages, mood and demands", () => {
  it("matches the fitted market wage", () => {
    expect(marketWage(65, 27, 200_000_000)).toBeCloseTo(6_463_000, -4);
    expect(marketWage(65, 27, 800_000_000)).toBeGreaterThan(marketWage(65, 27, 200_000_000));
    expect(marketWage(65, 19, 200_000_000)).toBeLessThan(marketWage(65, 27, 200_000_000));
  });

  it("weighs mood components, with traits doubling theirs", () => {
    const club = { ...(generated.clubs[0] as Club), market: 100 };
    const season = { ...(generated.clubSeasons[0] as ClubSeason), hype: 50 };
    const ctx = { club, season, success: 50, minutesShare: 0.4, yearsAtClub: 0 };
    const plain = playerMood(someone({ moodTraits: [] }), ctx);
    const famous = playerMood(someone({ moodTraits: ["fame"] }), ctx);
    expect(famous.value).toBeGreaterThan(plain.value);
    const miserable = playerMood(someone({ moodTraits: [] }), {
      ...ctx,
      club: { ...club, market: 0, facilitiesLevel: 0 },
      season: { ...season, hype: 0 },
      success: 0,
      minutesShare: 0,
    });
    expect(miserable.willing).toBe(false);
    expect(plain.willing).toBe(true);
  });

  it("asks least for the length he wants, more in his final year, less when happy", () => {
    const p = someone({ birthDate: "2000-01-01", moodTraits: [] });
    const asks = contractAsks(p, DATE, 200_000_000, 0, false);
    const want = preferredYears(26);
    const cheapest = [...asks].sort((a, b) => a.wage - b.wage)[0];
    expect(cheapest?.years).toBe(want);
    const final = contractAsks(p, DATE, 200_000_000, 0, true);
    expect(final[0]?.wage).toBeGreaterThan(asks[0]?.wage ?? 0);
    const happy = contractAsks(p, DATE, 200_000_000, 0.8, false);
    expect(happy[0]?.wage).toBeLessThan(asks[0]?.wage ?? 0);
    const greedy = contractAsks({ ...p, moodTraits: ["money"] }, DATE, 200_000_000, 0, false);
    expect(greedy[0]?.wage).toBeGreaterThan(asks[0]?.wage ?? 0);
  });

  it("counts a summer deal's years from this season, a January deal's from the next", () => {
    expect(contractEnd(2026, 1, "2026-07-01")).toBe("2027-06-30");
    expect(contractEnd(2026, 2, "2027-01-15")).toBe("2029-06-30");
  });

  it("re-spreads a remaining transfer fee over the new contract", () => {
    const p = someone({ feeBalance: { remaining: 6_000_000, perYear: 3_000_000 } });
    signContract(p, 2_000_000, "2031-06-30", DATE);
    expect(p.feeBalance).toEqual({ remaining: 6_000_000, perYear: 1_200_000 });
  });
});

describe("the contract year", () => {
  it("lets contracts that ended on 30 June expire on 1 July, and tells the user who left", () => {
    const w = freshWorld();
    const ending = w.players.filter(
      (p) => p.status === "club" && p.contract?.expires === "2027-06-30",
    );
    const log = expireContracts(w, 2027, "2027-07-01");
    expect(log.changed.size).toBe(ending.length);
    for (const p of ending) {
      expect(p).toMatchObject({
        status: "freeAgent",
        cid: null,
        contract: null,
        freeAgentSince: "2027-07-01",
      });
    }
    if (ending.some((p) => p.transfers.at(-1)?.fromCid === 0)) {
      expect(log.messages[0]?.subject).toMatch(/left at the end of their contracts/);
    }
  });

  it("has the AI renew the players it wants, never the user's", () => {
    const w = freshWorld();
    const date = "2027-01-01";
    const finalYear = (cid: number) =>
      w.players.filter((p) => p.cid === cid && p.status === "club" && yearsLeft(p, date) === 1);
    const userBefore = finalYear(0).map((p) => p.contract?.expires);
    const aiBefore = w.clubs.slice(1).flatMap((c) => finalYear(c.cid)).length;
    const log = aiRenewals(w, 2026, date, "winter");
    expect(log.transactions.length).toBeGreaterThan(0.3 * aiBefore);
    expect(log.transactions.every((t) => t.type === "renewal" && t.cids[0] !== 0)).toBe(true);
    expect(finalYear(0).map((p) => p.contract?.expires)).toEqual(userBefore);
    for (const t of log.transactions) {
      const renewed = w.players.find((p) => p.pid === t.pids[0]);
      expect(yearsLeft(renewed as Player, date)).toBeGreaterThan(1);
    }
  });

  it("warns the user in January and again before deadline day", () => {
    const w = freshWorld();
    const warning = contractWarning(w, 2026, "2027-01-01", false);
    const reminder = contractWarning(w, 2026, "2027-01-30", true);
    const expiring = w.players.filter(
      (p) => p.cid === 0 && p.status === "club" && yearsLeft(p, "2027-01-01") === 1,
    );
    if (expiring.length === 0) {
      expect(warning).toBeNull();
    } else {
      expect(warning?.subject).toMatch(/end in June/);
      expect(reminder?.subject).toMatch(/Deadline day tomorrow/);
      expect(warning?.body).toContain(expiring[0]?.lastName ?? "");
    }
  });
});
