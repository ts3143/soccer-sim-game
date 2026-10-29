import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { play } from "../league/game";
import { createLeague, openLeague } from "../league/session";
import { getBoxScore, getMatchPreview } from "./matches";
import { getPlayer } from "./players";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("match preview and player form (T, 2026-10-25)", () => {
  it(
    "shows both clubs' last five, their last meeting, derbies, and a player's last five",
    // About 27 s locally; GitHub's runners took 111-120 s.
    { timeout: 300_000 },
    async () => {
      const league = await createLeague({
        world: "classic",
        name: "Preview",
        seed: "preview-view",
        userCid: 5,
      });
      const session = await openLeague(league.lid);
      for (let i = 0; i < 7; i++) await play(session, "untilNextMatch");
      const game = session.cache.get("meta", "game") as GameMeta;
      const fixtures = session.cache.getAll("fixtures");
      const next = fixtures
        .filter((f) => f.result === null && (f.homeCid === 5 || f.awayCid === 5))
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      if (!next) throw new Error("no next fixture");

      const preview = await getMatchPreview(league.lid, next.fid);
      for (const [i, cid] of [next.homeCid, next.awayCid].entries()) {
        const form = preview.form[i as 0 | 1];
        expect(form).toHaveLength(5);
        const dates = form.map((m) => m.match.date);
        expect(dates).toEqual([...dates].sort());
        expect(dates.every((d) => d < next.date)).toBe(true);
        for (const m of form) {
          expect([m.match.home.cid, m.match.away.cid]).toContain(cid);
          expect(m.opponent.cid).not.toBe(cid);
          expect(m.result).not.toBeNull();
        }
      }

      // The return fixture of a played match looks back to it.
      const played = fixtures.find(
        (f) =>
          f.result !== null &&
          f.competition === next.competition &&
          fixtures.some(
            (g) => g.homeCid === f.awayCid && g.awayCid === f.homeCid && g.result === null,
          ),
      );
      if (!played) throw new Error("no played league fixture with a return match");
      const back = fixtures.find(
        (g) => g.homeCid === played.awayCid && g.awayCid === played.homeCid,
      );
      const again = await getMatchPreview(league.lid, back?.fid ?? -1);
      expect(again.lastMeeting?.fid).toBe(played.fid);
      expect(again.lastMeeting?.score).not.toBeNull();
      const unplayed = fixtures.find(
        (f) =>
          f.result === null &&
          !fixtures.some(
            (g) =>
              g.result !== null &&
              ((g.homeCid === f.homeCid && g.awayCid === f.awayCid) ||
                (g.homeCid === f.awayCid && g.awayCid === f.homeCid)),
          ),
      );
      expect((await getMatchPreview(league.lid, unplayed?.fid ?? -1)).lastMeeting).toBeNull();

      // Same city: a derby.
      const city = new Map(session.cache.getAll("clubs").map((c) => [c.cid, c.city]));
      const derby = fixtures.find((f) => city.get(f.homeCid) === city.get(f.awayCid));
      const plain = fixtures.find((f) => city.get(f.homeCid) !== city.get(f.awayCid));
      expect((await getMatchPreview(league.lid, derby?.fid ?? -1)).derby).toBe(
        city.get(derby?.homeCid ?? -1),
      );
      expect((await getMatchPreview(league.lid, plain?.fid ?? -1)).derby).toBeNull();

      // A regular's last five, newest first, with his rating from each box score.
      const regular = session.cache
        .getAll("playerStats")
        .filter((r) => r.cid === 5 && r.season === game.season)
        .sort((a, b) => b.appearances - a.appearances)[0];
      const profile = await getPlayer(league.lid, regular?.pid ?? -1);
      expect(profile.form).toHaveLength(5);
      const dates = profile.form.map((m) => m.match.date);
      expect(dates).toEqual([...dates].sort().reverse());
      for (const m of profile.form) {
        expect(m.opponent.cid).not.toBe(5);
        const box = await getBoxScore(league.lid, m.match.fid);
        const line = box.result?.players.find((l) => l.pid === regular?.pid);
        expect(m.rating).toBe(line?.rating);
        expect(m.minutes).toBe(line?.minutes);
        expect(m.motm).toBe(box.result?.motm === regular?.pid);
      }
      // Injury history (T, 2026-10-25): since the league began, newest first.
      const hurt = session.cache.getAll("players").filter((p) => (p.injuries?.length ?? 0) > 0);
      expect(hurt.length).toBeGreaterThan(20);
      const inMatch = hurt.find((p) => p.injuries?.some((i) => i.fid !== null));
      const history = await getPlayer(league.lid, inMatch?.pid ?? -1);
      expect(history.injuriesSince).toBe("2026-07-01");
      const injuryDates = history.injuries.map((i) => i.date);
      expect(injuryDates).toEqual([...injuryDates].sort().reverse());
      for (const i of history.injuries) {
        expect(i.days).toBeGreaterThan(0);
        if (i.fid === null) expect(i.opponent).toBeNull();
        else {
          const f = session.cache.get("fixtures", i.fid);
          expect(f?.date).toBe(i.date);
          expect([f?.homeCid, f?.awayCid]).toContain(i.opponent?.cid);
        }
      }
      // Nobody plays for an academy player yet: no form.
      const youngster = session.cache
        .getAll("players")
        .find((p) => p.cid === 5 && p.status === "academy");
      expect((await getPlayer(league.lid, youngster?.pid ?? -1)).form).toEqual([]);
    },
  );
});
