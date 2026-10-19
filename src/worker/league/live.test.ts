import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { getTactics, saveTactics } from "../views/tactics";
import { gameState, play } from "./game";
import {
  forgetRunningMatch,
  getLive,
  getLiveLineup,
  setLiveLineup,
  stepLive,
  watchNextMatch,
} from "./live";
import { setWageShare } from "./market";
import { createLeague, openLeague, type LeagueSession } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function league(name: string) {
  const created = await createLeague({ name, seed: "live-match", userCid: 0 });
  return { lid: created.lid, session: await openLeague(created.lid) };
}

/** What a played day leaves behind, to compare two ways of playing it. */
function snapshot(session: LeagueSession) {
  const game = session.cache.get("meta", "game") as GameMeta;
  return {
    date: game.date,
    phase: game.phase,
    fixtures: session.cache
      .getAll("fixtures")
      .filter((f) => f.result)
      .map((f) => [f.fid, f.result?.homeGoals, f.result?.awayGoals]),
    matches: session.cache.getAll("matches").map((m) => JSON.stringify(m.result)),
    players: session.cache
      .getAll("players")
      .map((p) => [p.pid, p.cid, p.condition, p.conditionDate, p.injury?.until ?? null]),
    clubs: session.cache.getAll("clubs").map((c) => [c.cid, c.cash]),
    seasons: session.cache.getAll("clubSeasons").map((r) => JSON.stringify(r)),
    stats: session.cache.getAll("playerStats").length,
    inbox: session.cache.getAll("inbox").length,
    transactions: session.cache.getAll("transactions").length,
  };
}

describe("watching a match live", () => {
  it(
    "gives the same day as simulating it when the AI manages the user's club",
    { timeout: 180_000 },
    async () => {
      const a = await league("Simulated");
      await play(a.session, "untilNextMatch");
      const b = await league("Watched by the AI");
      const started = await watchNextMatch(b.session, "ai");
      expect(started.live).not.toBeNull();
      const end = await stepLive(b.session, Infinity, 0);
      expect(end.report?.matchesPlayed).toBeGreaterThan(0);
      const [sa, sb] = [snapshot(a.session), snapshot(b.session)];
      for (const key of Object.keys(sa) as (keyof typeof sa)[]) {
        expect({ key, value: sb[key] }).toEqual({ key, value: sa[key] });
      }
    },
  );

  it(
    "uses the user's line-up, holds the game and saves the match at full time",
    { timeout: 180_000 },
    async () => {
      const { lid, session } = await league("Watched");
      const tactics = await getTactics(lid, null);
      await saveTactics(lid, {
        ...tactics.setup,
        sliders: { mentality: 1, pressing: -1, directness: 0 },
      });

      const started = await watchNextMatch(session);
      const fid = started.live ?? -1;
      const state = gameState(session);
      expect(state.live).toEqual({ fid });
      expect(state.options).toEqual([]);
      expect(state.date).toBe(session.cache.get("fixtures", fid)?.date);
      await expect(play(session, "oneWeek")).rejects.toThrow(/Finish your live match/);
      await expect(setWageShare(session, 0.5)).rejects.toThrow(/Finish your live match/);

      const kickoff = getLive(session, 0);
      if (!kickoff) throw new Error("no live match");
      const mine = kickoff.teams[kickoff.userSide];
      const theirs = kickoff.teams[kickoff.userSide === 0 ? 1 : 0];
      expect(kickoff.clock).toBe(0);
      expect(kickoff.atBreak).toBe(true);
      expect(mine.user).toBe(true);
      expect(theirs.user).toBe(false);
      expect(mine.sliders).toEqual({ mentality: 1, pressing: -1, directness: 0 });
      expect(mine.formation).toBe(tactics.setup.formation);
      expect(mine.onPitch.every((p) => p !== null)).toBe(true);
      expect(mine.onPitch.map((p) => p?.pid)).toEqual(tactics.setup.slots);
      expect(mine.bench.length).toBe(9);
      expect(Object.keys(kickoff.players).length).toBe(40);

      const later = await stepLive(session, 40, kickoff.feedLength);
      expect(later.minute).toBeGreaterThan(10);
      expect(later.events.length).toBe(later.feedLength - kickoff.feedLength);
      expect(later.report).toBeNull();

      // A restarted worker picks the match up from its last save, not from kick-off.
      forgetRunningMatch(session);
      const resumed = getLive(session, 0);
      expect(resumed?.minute).toBeGreaterThan(0);
      expect(resumed?.minute).toBeLessThanOrEqual(later.minute);

      const end = await stepLive(session, Infinity, 0);
      expect(end.finished).toBe(true);
      expect(end.report).not.toBeNull();
      expect(getLive(session, 0)).toBeNull();
      expect(session.cache.get("fixtures", fid)?.result?.homeGoals).toBe(end.score[0]);
      expect(session.cache.get("matches", fid)).toBeDefined();
      const competition = session.cache.get("fixtures", fid)?.competition ?? "";
      const season = (session.cache.get("meta", "game") as GameMeta).season;
      expect(
        session.cache
          .getAll("playerStats")
          .some((r) => r.cid === 0 && r.season === season && r.competition === competition),
      ).toBe(true);
      expect(gameState(session).live).toBeNull();
      expect(gameState(session).options).toContain("untilNextMatch");
    },
  );

  it("resumes a closed game to the same result: no do-overs", { timeout: 180_000 }, async () => {
    const straight = await league("Straight");
    await watchNextMatch(straight.session);
    const one = await stepLive(straight.session, Infinity, 0);

    const broken = await league("Interrupted");
    await watchNextMatch(broken.session);
    await stepLive(broken.session, 55, 0);
    forgetRunningMatch(broken.session);
    const two = await stepLive(broken.session, Infinity, 0);

    expect(two.score).toEqual(one.score);
    expect(JSON.stringify(broken.session.cache.get("matches", two.fid)?.result)).toBe(
      JSON.stringify(straight.session.cache.get("matches", one.fid)?.result),
    );
  });

  it(
    "changes the line-up for this match before kick-off, and only then",
    { timeout: 180_000 },
    async () => {
      const plain = await league("Unchanged");
      await watchNextMatch(plain.session);
      const reference = await stepLive(plain.session, Infinity, 0);

      const { session } = await league("Pre-match");
      await watchNextMatch(session);
      const before = getLiveLineup(session);
      const kickoff = getLive(session, 0);
      if (!kickoff) throw new Error("no live match");
      expect(before.setup.slots).toEqual(
        kickoff.teams[kickoff.userSide].onPitch.map((p) => p?.pid),
      );
      expect(before.reserves.every((p) => p.injury === null)).toBe(true);

      // Re-applying the same line-up restarts the match unchanged.
      await setLiveLineup(session, before.setup, "asIs");

      const sub = before.setup.bench[0] ?? -1;
      const swapped = await setLiveLineup(
        session,
        {
          ...before.setup,
          slots: before.setup.slots.map((pid, i) => (i === 9 ? sub : pid)),
          bench: before.setup.bench.map((pid, i) =>
            i === 0 ? (before.setup.slots[9] ?? pid) : pid,
          ),
        },
        "asIs",
      );
      expect(swapped.setup.slots[9]).toBe(sub);
      expect(getLive(session, 0)?.teams[kickoff.userSide].onPitch[9]?.pid).toBe(sub);
      expect(getLive(session, 0)?.clock).toBe(0);

      const auto = await setLiveLineup(session, swapped.setup, "auto");
      expect(auto.setup.slots.every((pid) => pid !== null)).toBe(true);
      const saved = await setLiveLineup(session, auto.setup, "saved");
      expect(saved.setup).toEqual(before.setup);

      const outsider = session.cache.getAll("players").find((p) => p.cid === 5)?.pid ?? -1;
      // Players who can't play for the club are left out.
      const cleaned = await setLiveLineup(session, { ...saved.setup, bench: [outsider] }, "asIs");
      expect(cleaned.setup.bench).toEqual([]);
      await setLiveLineup(session, saved.setup, "asIs");

      await stepLive(session, 1, 0);
      await expect(setLiveLineup(session, saved.setup, "asIs")).rejects.toThrow(/kicked off/);
      const end = await stepLive(session, Infinity, 0);
      expect(JSON.stringify(session.cache.get("matches", end.fid)?.result)).toBe(
        JSON.stringify(plain.session.cache.get("matches", reference.fid)?.result),
      );
    },
  );
});
