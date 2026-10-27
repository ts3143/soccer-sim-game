import { worlds } from "../../common/config/worlds";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { leagueById } from "../../common/config/competitions";
import type { ClubSeason, GameMeta } from "../../common/schema";
import { listLeagues } from "../db/globalDb";
import { attendance } from "../finance/finance";
import { decideAcademyPlayer, setBudgetDials, setTicketPrice } from "../league/club";
import { gameState, loopWorld, play, renameLeague } from "../league/game";
import { setWageShare } from "../league/market";
import { createLeague, openLeague } from "../league/session";
import { academyDecisions, academyReminder } from "../season/offseason";
import { getAcademy, getClubFinances, getJobOffers } from "./club";

const competitions = worlds.classic.competitions;

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("the user's academy", () => {
  it(
    "lists his prospects, promotes and releases on his say, and leaves the rest to 1 July",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Academy",
        seed: "academy-view",
        userCid: 0,
      });
      const session = await openLeague(league.lid);
      const view = await getAcademy(league.lid);
      expect(view.decideBy).toBe("2027-07-01");
      expect(view.players.length).toBeGreaterThan(5);
      expect(
        view.players.every((p, i) => i === 0 || p.pot <= (view.players[i - 1]?.pot ?? 99)),
      ).toBe(true);
      expect(view.players.every((p) => p.wage > 0)).toBe(true);

      // AI clubs promote outstanding 17-year-olds early; the user's are his to decide.
      // On a copy: this tries out 1 July without touching the save.
      const { nextPid, ...data } = loopWorld(session, 2026);
      const world = { ...structuredClone(data), nextPid };
      const seventeen = world.players.filter(
        (p) =>
          p.status === "academy" &&
          p.cid !== null &&
          Math.floor((Date.parse("2027-07-01") - Date.parse(p.birthDate)) / 3.156e10) === 17,
      );
      for (const p of seventeen) p.pot = 99;
      const log = academyDecisions(world, 2027, "2027-07-01");
      const promoted = new Set(
        log.transactions.filter((t) => t.type === "academyPromotion").flatMap((t) => t.pids),
      );
      expect(seventeen.some((p) => p.cid !== 0 && promoted.has(p.pid))).toBe(true);
      expect(seventeen.some((p) => p.cid === 0 && promoted.has(p.pid))).toBe(false);

      // The May reminder lists the ones due, if any.
      const reminder = academyReminder(loopWorld(session, 2026), 2026, "2027-05-01");
      const due = view.players.filter((p) => p.mustDecide);
      if (due.length > 0) expect(reminder?.body).toContain(due[0]?.name ?? "");
      else expect(reminder).toBeNull();

      const [first, second] = view.players;
      if (!first || !second) throw new Error("too few academy players");
      expect(await decideAcademyPlayer(session, first.pid, "promote")).toMatch(
        /first professional contract/,
      );
      const promotedNow = session.cache.get("players", first.pid);
      expect(promotedNow?.status).toBe("club");
      expect(promotedNow?.contract?.expires).toBe("2029-06-30");
      expect(await decideAcademyPlayer(session, second.pid, "release")).toMatch(
        /leaves the academy/,
      );
      expect(session.cache.get("players", second.pid)?.status).toBe("freeAgent");
      expect((await getAcademy(league.lid)).players.some((p) => p.pid === first.pid)).toBe(false);
      await expect(decideAcademyPlayer(session, first.pid, "promote")).rejects.toThrow(/academy/);
      expect(
        session.cache
          .getAll("transactions")
          .filter((t) => t.pids.includes(first.pid) || t.pids.includes(second.pid))
          .map((t) => t.type)
          .sort(),
      ).toEqual(["academyPromotion", "release"]);
    },
  );
});

describe("the user's finances", () => {
  it("sells fewer tickets the dearer they are", () => {
    const club = { capacity: 40_000, market: 60, facilitiesLevel: 50 };
    const league = leagueById(competitions, "ENG2");
    const at = (ratio: number) => attendance(club, 50, league, 50, 1, ratio);
    expect(at(1)).toBe(attendance(club, 50, league, 50));
    expect(at(1.5)).toBeLessThan(at(1));
    expect(at(0.6)).toBeGreaterThanOrEqual(at(1));
    expect(at(10)).toBeGreaterThan(0);
  });

  it(
    "shows the books, sets dials, the fees/wages split and the ticket price until a home match",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Books",
        seed: "club-finances",
        userCid: 0,
      });
      const session = await openLeague(league.lid);
      const view = await getClubFinances(league.lid);
      expect(view.dials.map((d) => d.key)).toEqual(["coaching", "youth", "medical", "facilities"]);
      expect(view.dials.every((d) => d.cost > 0)).toBe(true);
      expect(view.ticket.auto).toBe(true);
      expect(view.ticket.locked).toBe(false);
      expect(view.ticket.price).toBe(view.ticket.fair);
      const crowds = view.ticket.curve.map((c) => c.attendance);
      expect(crowds.every((c, i) => i === 0 || c <= (crowds[i - 1] ?? Infinity))).toBe(true);
      expect(view.cashHistory.at(-1)?.current).toBe(true);
      expect(view.ffp.limit).toBe(0.7);

      await setBudgetDials(session, { coaching: 80, youth: 20, medical: 50, facilities: 50 });
      const dialled = await getClubFinances(league.lid);
      expect(dialled.dials.find((d) => d.key === "coaching")?.level).toBe(80);
      expect(dialled.dials.find((d) => d.key === "coaching")?.cost).toBeGreaterThan(
        view.dials.find((d) => d.key === "coaching")?.cost ?? Infinity,
      );
      await expect(
        setBudgetDials(session, { coaching: 120, youth: 20, medical: 50, facilities: 50 }),
      ).rejects.toThrow(/0 to 100/);

      await setWageShare(session, 0.8);
      const split = await getClubFinances(league.lid);
      expect(split.budget.wageShare).toBe(0.8);
      expect(split.budget.wageRoom).toBeGreaterThan(view.budget.wageRoom);

      const dear = Math.round(view.ticket.fair * 1.3);
      await setTicketPrice(session, dear, view.ticket.fair);
      expect((await getClubFinances(league.lid)).ticket).toMatchObject({
        price: dear,
        auto: false,
      });
      await setTicketPrice(session, null, view.ticket.fair);
      expect((await getClubFinances(league.lid)).ticket).toMatchObject({
        price: view.ticket.fair,
        auto: true,
      });
      await setTicketPrice(session, dear, view.ticket.fair);

      // Once a home match is played the price is set for the season.
      const userCid = (session.cache.get("meta", "game") as GameMeta).userCid;
      while (
        !session.cache
          .getAll("fixtures")
          .some((f) => f.homeCid === userCid && f.result && !f.neutral)
      ) {
        await play(session, "untilNextMatch");
      }
      const locked = await getClubFinances(league.lid);
      expect(locked.ticket.locked).toBe(true);
      expect(locked.revenue.find((r) => r.kind === "matchday")?.amount).toBeGreaterThan(0);
      await expect(setTicketPrice(session, null, view.ticket.fair)).rejects.toThrow(
        /set for this season/,
      );
    },
  );
});

describe("sacked, and the save's name", () => {
  it(
    "shows the club that sacked the user, his record and his offers; renames the save",
    { timeout: 180_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Sacked",
        seed: "fired-view",
        userCid: 0,
      });
      const session = await openLeague(league.lid);
      expect(await getJobOffers(league.lid)).toBeNull();
      const row = session.cache.get("clubSeasons", [0, 2026]) as ClubSeason;
      session.cache.put("clubSeasons", {
        ...row,
        boardExpectation: "title",
        boardStart: 0,
        boardConfidence: 0,
      });
      const club = session.cache.get("clubs", 0);
      if (club) session.cache.put("clubs", { ...club, cash: -10 * club.revenueAnchor });
      await play(session, "untilEndOfSeason");
      const fired = await getJobOffers(league.lid);
      expect(fired?.club.cid).toBe(0);
      expect(fired?.record.played).toBeGreaterThan(0);
      expect(fired?.offers.map((o) => o.team.cid)).toEqual(
        gameState(session).fired?.offers.map((o) => o.cid),
      );
      expect(fired?.offers.every((o) => o.strength > 30 && o.leagueName.length > 0)).toBe(true);

      await renameLeague(session, "  The comeback  ");
      expect((session.cache.get("meta", "game") as GameMeta).name).toBe("The comeback");
      expect((await listLeagues()).find((l) => l.lid === league.lid)?.name).toBe("The comeback");
      await expect(renameLeague(session, "   ")).rejects.toThrow(/1 to 60/);
    },
  );
});
