import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { play } from "../league/game";
import { bidForPlayer, contractTalks, renewContract, signPlayer } from "../league/market";
import { createLeague, openLeague } from "../league/session";
import { getFreeAgents } from "./market";

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
