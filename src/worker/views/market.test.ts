import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { play } from "../league/game";
import { owedWages } from "../finance/finance";
import {
  bidForPlayer,
  contractTalks,
  listPlayer,
  releasePlayer,
  renewContract,
  signPlayer,
  userOffers,
} from "../league/market";
import { createLeague, openLeague } from "../league/session";
import { getFreeAgents, getTransferMarket } from "./market";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("free agents", () => {
  it(
    "lists them with their asks, and signs one outside a window",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({ name: "Free agents", seed: "free-agents", userCid: 0 });
      const session = await openLeague(league.lid);
      const view = await getFreeAgents(league.lid);
      expect(view.rows.length).toBeGreaterThan(50);
      expect(view.rows.every((r, i) => i === 0 || r.ovr <= (view.rows[i - 1]?.ovr ?? 99))).toBe(
        true,
      );
      expect(view.rows.every((r) => r.ask > 0 && r.value > 0)).toBe(true);
      expect(view.rows.some((r) => r.willing)).toBe(true);
      expect(view.windowOpen).toBe(true);
      expect(view.seniors).toBeLessThanOrEqual(view.maxSeniors);

      await play(session, "untilWindowCloses");
      await play(session, "oneWeek");
      const later = await getFreeAgents(league.lid);
      expect(later.windowOpen).toBe(false);
      const pick = later.rows.find((r) => r.willing && r.ask <= later.wageRoom);
      if (!pick) throw new Error("no affordable free agent");
      const years = contractTalks(session, pick.pid).asks.find(
        (a) => a.wage <= later.wageRoom,
      )?.years;
      await signPlayer(session, pick.pid, years ?? 1);
      const signed = session.cache.get("players", pick.pid);
      expect(signed?.cid).toBe(0);
      expect(signed?.status).toBe("club");
      expect(
        session.cache
          .getAll("transactions")
          .some((t) => t.type === "freeAgent" && t.pids.includes(pick.pid)),
      ).toBe(true);
      expect((await getFreeAgents(league.lid)).rows.some((r) => r.pid === pick.pid)).toBe(false);

      // Renewals and transfers still wait for a window.
      const mine = session.cache
        .getAll("players")
        .find((p) => p.cid === 0 && p.status === "club" && p.pid !== pick.pid);
      const theirs = session.cache
        .getAll("players")
        .find((p) => p.cid === 3 && p.status === "club");
      await expect(renewContract(session, mine?.pid ?? -1, 3)).rejects.toThrow(/window/);
      await expect(bidForPlayer(session, theirs?.pid ?? -1, 1_000_000)).rejects.toThrow(
        /window is closed/,
      );
      expect((session.cache.get("meta", "game") as GameMeta).date > "2026-08-31").toBe(true);
    },
  );
});

describe("releasing and listing players", () => {
  it("knows what a club still owes for released players", () => {
    const club = {
      released: [
        { pid: 1, name: "A", wage: 1_200_000, until: "2027-06-30" },
        { pid: 2, name: "B", wage: 600_000, until: "2028-06-30" },
      ],
    };
    expect(owedWages(club)).toBe(1_800_000);
    expect(owedWages(club, "2027-06-30")).toBe(1_800_000);
    expect(owedWages(club, "2027-07-31")).toBe(600_000);
    expect(owedWages({}, "2027-07-31")).toBe(0);
  });

  it(
    "releases a player: he leaves, his wage and fee are still paid, nothing is saved",
    { timeout: 180_000 },
    async () => {
      const books = (s: Awaited<ReturnType<typeof openLeague>>) => {
        const row = s.cache.get("clubSeasons", [0, 2026]);
        return [Math.round(row?.expenses.wages ?? 0), Math.round(row?.amortisation ?? 0)];
      };
      // The same league kept whole, played first (one save is open at a time).
      const kept = await createLeague({ name: "Kept", seed: "release", userCid: 0 });
      const a = await openLeague(kept.lid);
      await play(a, "untilWindowCloses");
      const keptBooks = books(a);

      const gone = await createLeague({ name: "Released", seed: "release", userCid: 0 });
      const b = await openLeague(gone.lid);
      const before = await getTransferMarket(gone.lid);
      const p = b.cache
        .getAll("players")
        .filter((x) => x.cid === 0 && x.status === "club" && x.feeBalance?.remaining)
        .sort((x, y) => x.ovr - y.ovr)[0];
      if (!p?.contract || !p.feeBalance) throw new Error("no player with a fee to release");
      const writeOff = p.feeBalance.remaining;
      const { wage, expires } = p.contract;
      const name = `${p.firstName} ${p.lastName}`.trim();
      const amortised = b.cache.get("clubSeasons", [0, 2026])?.amortisation ?? 0;
      const message = await releasePlayer(b, p.pid);
      expect(message).toMatch(/keep paying/);
      const after = await getTransferMarket(gone.lid);
      expect(b.cache.get("players", p.pid)?.status).toBe("freeAgent");
      expect(after.squad.some((r) => r.pid === p.pid)).toBe(false);
      expect(after.released).toEqual([{ pid: p.pid, name, wage, until: expires }]);
      expect(after.budget.owed).toBe(wage);
      // Releasing frees no wage room; his fee goes on being amortised as before.
      expect(Math.abs(after.budget.wageRoom - before.budget.wageRoom)).toBeLessThanOrEqual(1);
      expect(b.cache.get("clubSeasons", [0, 2026])?.amortisation ?? 0).toBe(amortised);
      expect(b.cache.get("clubs", 0)?.released?.[0]?.fee?.remaining).toBe(writeOff);
      expect(
        b.cache.getAll("transactions").some((t) => t.type === "release" && t.pids.includes(p.pid)),
      ).toBe(true);

      // Month by month the club pays exactly what it would have paid keeping him.
      await play(b, "untilWindowCloses");
      expect(books(b)).toEqual(keptBooks);
      await expect(releasePlayer(b, p.pid)).rejects.toThrow(/your own players/);
    },
  );

  it(
    "lists a player: AI clubs bid near his price; unlisting stops it",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({ name: "Listed", seed: "listing", userCid: 0 });
      const session = await openLeague(league.lid);
      const view = await getTransferMarket(league.lid);
      const listed = view.squad.filter((r) => ["CM", "ST", "CB"].includes(r.position)).slice(0, 3);
      for (const r of listed)
        await listPlayer(session, r.pid, Math.round(r.value / 10_000) * 10_000);
      const now = await getTransferMarket(league.lid);
      expect(now.squad.filter((r) => r.listed !== null).map((r) => r.pid)).toEqual(
        listed.map((r) => r.pid),
      );
      await play(session, "untilWindowCloses");
      const bids = userOffers(session).filter(
        (o) => o.incoming && listed.some((r) => r.pid === o.pid),
      );
      expect(bids.length).toBeGreaterThan(0);
      for (const bid of bids) {
        const asking =
          Math.round((listed.find((r) => r.pid === bid.pid)?.value ?? 0) / 10_000) * 10_000;
        expect(bid.fee).toBeGreaterThanOrEqual(0.85 * asking - 10_000);
        expect(bid.fee).toBeLessThanOrEqual(asking);
      }
      const first = listed[0]?.pid ?? -1;
      await listPlayer(session, first, null);
      expect(session.cache.get("players", first)?.listed).toBeUndefined();
      await expect(listPlayer(session, first, -5)).rejects.toThrow(/whole number/);
    },
  );
});
