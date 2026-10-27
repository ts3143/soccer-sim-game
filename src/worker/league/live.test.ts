import { worlds } from "../../common/config/worlds";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMeta } from "../../common/schema";
import { getTactics, saveTactics } from "../views/tactics";
import { startMatch, stepMatch } from "../engine/match";
import { fixtureSetup } from "../season/season";
import { squadPlay } from "../season/squads";
import { gameState, loadSeason, loopWorld, play } from "./game";
import {
  changeLive,
  forgetRunningMatch,
  getLive,
  getLiveBoard,
  getLiveLineup,
  pauseFor,
  previewLiveChanges,
  setLiveLineup,
  stepLive,
  watchNextMatch,
} from "./live";
import { setWageShare } from "./market";
import { createLeague, openLeague, type LeagueSession } from "./session";

const competitions = worlds.classic.competitions;

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
      const end = await stepLive(b.session, Infinity, 0, false);
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

      const later = await stepLive(session, 40, kickoff.feedLength, false);
      expect(later.minute).toBeGreaterThan(10);
      expect(later.events.length).toBe(later.feedLength - kickoff.feedLength);
      expect(later.report).toBeNull();

      // A restarted worker picks the match up from its last save, not from kick-off.
      forgetRunningMatch(session);
      const resumed = getLive(session, 0);
      expect(resumed?.minute).toBeGreaterThan(0);
      expect(resumed?.minute).toBeLessThanOrEqual(later.minute);

      const end = await stepLive(session, Infinity, 0, false);
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
    const one = await stepLive(straight.session, Infinity, 0, false);

    const broken = await league("Interrupted");
    await watchNextMatch(broken.session);
    await stepLive(broken.session, 55, 0, false);
    forgetRunningMatch(broken.session);
    const two = await stepLive(broken.session, Infinity, 0, false);

    expect(two.score).toEqual(one.score);
    expect(JSON.stringify(broken.session.cache.get("matches", two.fid)?.result)).toBe(
      JSON.stringify(straight.session.cache.get("matches", one.fid)?.result),
    );
  });

  it(
    "shows the saved tactics as they are, and won't kick off with someone who can't play",
    { timeout: 180_000 },
    async () => {
      const { session } = await league("Unavailable");
      const lineup = session.cache.get("clubs", 0)?.tactics.lineup;
      if (!lineup) throw new Error("no saved line-up");
      const named = new Set([...lineup.slots, ...lineup.bench]);
      const mine = session.cache
        .getAll("players")
        .filter((p) => p.cid === 0 && p.status === "club")
        .sort((a, b) => b.ovr - a.ovr);
      const [hurt, banned] = mine.filter((p) => lineup.slots.includes(p.pid));
      const outside = mine.find((p) => !named.has(p.pid));
      if (!hurt || !banned || !outside) throw new Error("no players");
      const injury = { type: "Test strain", until: "2026-12-31" };
      session.cache.put("players", { ...hurt, injury });
      session.cache.put("players", { ...outside, injury });
      session.cache.put("players", { ...banned, suspension: { remaining: 1, date: "2026-07-01" } });
      await watchNextMatch(session);

      // His tactics as saved: the two stay in their slots; kick-off says why it can't start.
      const view = getLiveLineup(session);
      expect(view.setup.slots).toEqual(lineup.slots);
      expect(view.setup.bench).toEqual(lineup.bench);
      const slotOf = (pid: number) => view.slots[lineup.slots.indexOf(pid)]?.label;
      const name = (p: typeof hurt) => `${p.firstName} ${p.lastName}`.trim();
      // In slot order.
      const problems: [number, string][] = [
        [lineup.slots.indexOf(hurt.pid), `${name(hurt)} (${slotOf(hurt.pid)}) is injured.`],
        [lineup.slots.indexOf(banned.pid), `${name(banned)} (${slotOf(banned.pid)}) is suspended.`],
      ];
      expect(view.cantStart).toEqual(problems.sort((a, b) => a[0] - b[0]).map(([, text]) => text));
      expect(view.unavailable?.map((p) => p.pid)).toEqual([outside.pid]);
      await expect(stepLive(session, 1, 0)).rejects.toThrow(/can't start the match/);

      // Someone who can't play can't be brought in; one in the line-up can be moved.
      const tried = await setLiveLineup(session, { ...view.setup, bench: [outside.pid] }, "asIs");
      expect(tried.setup.bench).toEqual([]);
      expect(tried.unavailable?.map((p) => p.pid)).toContain(outside.pid);
      const benched = await setLiveLineup(
        session,
        {
          ...view.setup,
          slots: view.setup.slots.map((pid) => (pid === hurt.pid ? (lineup.bench[0] ?? pid) : pid)),
          bench: [hurt.pid, ...lineup.bench.slice(1)],
        },
        "asIs",
      );
      expect(benched.setup.bench[0]).toBe(hurt.pid);
      expect(benched.cantStart).toContain(`${name(hurt)} (bench) is injured.`);

      // Auto leaves them out, and the match can kick off; My saved line-up brings them back.
      const auto = await setLiveLineup(session, benched.setup, "auto");
      const picked = [...auto.setup.slots, ...auto.setup.bench];
      expect(picked).not.toContain(hurt.pid);
      expect(picked).not.toContain(banned.pid);
      expect(auto.cantStart).toEqual([]);
      const saved = await setLiveLineup(session, auto.setup, "saved");
      expect(saved.setup.slots).toEqual(lineup.slots);
      expect(saved.cantStart).toHaveLength(2);
      await expect(stepLive(session, 1, 0)).rejects.toThrow(/can't start the match/);
      // The draft survives a closed game.
      forgetRunningMatch(session);
      expect(getLiveLineup(session).setup.slots).toEqual(lineup.slots);
      await setLiveLineup(session, saved.setup, "auto");
      expect((await stepLive(session, 1, 0)).clock).toBeGreaterThan(0);
      // His saved tactics never changed.
      expect(session.cache.get("clubs", 0)?.tactics.lineup).toEqual(lineup);
    },
  );

  it(
    "changes the line-up for this match before kick-off, and only then",
    { timeout: 180_000 },
    async () => {
      const plain = await league("Unchanged");
      await watchNextMatch(plain.session);
      const reference = await stepLive(plain.session, Infinity, 0, false);

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
      const end = await stepLive(session, Infinity, 0, false);
      expect(JSON.stringify(session.cache.get("matches", end.fid)?.result)).toBe(
        JSON.stringify(plain.session.cache.get("matches", reference.fid)?.result),
      );
    },
  );

  it("knows when to pause for the user", () => {
    const playing = { atBreak: false, finished: false, period: "first" as const };
    const injury = (side: 0 | 1, replaced: boolean) =>
      ({ type: "injury", clock: 600, side, pid: 7, days: 10, replaced }) as const;
    const card = (side: 0 | 1, kind: "yellow" | "secondYellow" | "red") =>
      ({ type: "card", clock: 700, side, pid: 8, card: kind }) as const;
    expect(pauseFor([injury(0, false)], 0, "first", playing)).toEqual({ reason: "injury", pid: 7 });
    expect(pauseFor([injury(1, false)], 0, "first", playing)).toBeNull();
    expect(pauseFor([injury(0, true)], 0, "first", playing)).toBeNull();
    expect(pauseFor([card(1, "red")], 1, "first", playing)).toEqual({ reason: "redCard", pid: 8 });
    expect(pauseFor([card(1, "secondYellow")], 1, "first", playing)?.reason).toBe("redCard");
    expect(pauseFor([card(1, "yellow")], 1, "first", playing)).toBeNull();
    const at = (period: "second" | "extraFirst" | "extraSecond") => ({
      atBreak: true,
      finished: false,
      period,
    });
    expect(pauseFor([], 0, "first", at("second"))?.reason).toBe("halfTime");
    expect(pauseFor([], 0, "second", at("extraFirst"))?.reason).toBe("extraTime");
    expect(pauseFor([], 0, "extraFirst", at("extraSecond"))?.reason).toBe("extraTimeBreak");
    expect(pauseFor([], 0, "second", at("second"))).toBeNull();
    expect(pauseFor([], 0, "second", { ...at("second"), finished: true })).toBeNull();
  });

  it(
    "stops at half-time and takes the user's subs, formation and sliders",
    { timeout: 180_000 },
    async () => {
      const { session } = await league("Changes");
      await watchNextMatch(session);
      let view = await stepLive(session, 1000, 0, true);
      while (view.pause?.reason !== "halfTime" && !view.finished) {
        view = await stepLive(session, 1000, 0, true);
      }
      expect(view.pause?.reason).toBe("halfTime");
      expect(view.atBreak).toBe(true);
      expect(view.clock).toBe(45 * 60);

      const mine = () => {
        const v = getLive(session, 0);
        if (!v) throw new Error("no live match");
        return v.teams[v.userSide];
      };
      const swap = (t: ReturnType<typeof mine>, i: number) => ({
        outPid: t.onPitch[i]?.pid ?? -1,
        inPid: t.bench[0]?.pid ?? -1,
      });
      // At a break substitutions are free.
      const halfTime = await changeLive(session, { subs: [swap(mine(), 5)] }, view.feedLength);
      expect(halfTime.events.some((e) => e.type === "sub")).toBe(true);
      expect(mine().subsUsed).toBe(1);
      expect(mine().windowsUsed).toBe(0);

      // During play, one call uses one window, however many come on.
      await stepLive(session, 3, 0, false);
      await changeLive(session, { subs: [swap(mine(), 6), swap(mine(), 7)].slice(0, 1) }, 0);
      expect(mine().subsUsed).toBe(2);
      expect(mine().windowsUsed).toBe(1);

      const formation = mine().formation === "4-4-2" ? "4-3-3" : "4-4-2";
      await changeLive(session, { formation, sliders: { mentality: 2 } }, 0);
      expect(mine().formation).toBe(formation);
      expect(mine().sliders.mentality).toBe(2);

      // Moving players between slots is free, even during play.
      const arranged = mine().onPitch.map((p) => p?.pid ?? null);
      [arranged[5], arranged[6]] = [arranged[6] ?? null, arranged[5] ?? null];
      const used = [mine().subsUsed, mine().windowsUsed];
      await changeLive(session, { slots: arranged }, 0);
      expect(mine().onPitch.map((p) => p?.pid ?? null)).toEqual(arranged);
      expect([mine().subsUsed, mine().windowsUsed]).toEqual(used);
      await expect(changeLive(session, { sliders: { pressing: 5 } }, 0)).rejects.toThrow(
        /whole steps/,
      );

      // To full time plays straight on.
      const end = await stepLive(session, Infinity, 0, false);
      expect(end.finished).toBe(true);
      expect(end.pause).toBeNull();
      expect(end.report).not.toBeNull();
    },
  );

  it(
    "shows the tactics board at a pause; previews and refused changes leave the match untouched",
    { timeout: 180_000 },
    async () => {
      const toHalfTime = async (session: LeagueSession) => {
        await watchNextMatch(session);
        let view = await stepLive(session, 1000, 0, true);
        while (view.pause?.reason !== "halfTime" && !view.finished) {
          view = await stepLive(session, 1000, 0, true);
        }
        return view;
      };
      const plain = await league("Board reference");
      await toHalfTime(plain.session);
      const reference = await stepLive(plain.session, Infinity, 0, false);

      const { session } = await league("Board");
      const view = await toHalfTime(session);
      expect(view.pause?.reason).toBe("halfTime");
      const team = view.teams[view.userSide];
      const board = getLiveBoard(session);
      expect(board.setup.slots).toEqual(team.onPitch.map((p) => p?.pid ?? null));
      expect(board.bench.map((p) => p.pid)).toEqual(team.bench.map((b) => b.pid));
      expect(board.reserves).toEqual([]);
      expect([board.free, board.subsLeft]).toEqual([true, team.subLimit - team.subsUsed]);
      expect(board.ratings).toHaveLength(7);
      for (const pid of board.setup.slots) {
        expect(board.match[pid ?? -1]?.minutes).toBe(45);
        expect(board.match[pid ?? -1]?.rating).not.toBeNull();
      }
      for (const b of board.bench) expect(board.match[b.pid]?.rating).toBeNull();

      // A sub for slot 9, two players swapped: previewed, not made.
      const sub = board.setup.bench[0] ?? -1;
      const out = board.setup.slots[9] ?? -1;
      const slots = board.setup.slots.map((pid, i, all) =>
        i === 5 ? all[6] : i === 6 ? all[5] : i === 9 ? sub : pid,
      ) as (number | null)[];
      const preview = previewLiveChanges(session, { subs: [{ outPid: out, inPid: sub }], slots });
      expect(preview.setup.slots).toEqual(slots);
      expect(preview.bench.map((p) => p.pid)).not.toContain(sub);
      expect(preview.subsLeft).toBe(board.subsLeft - 1);
      expect(getLiveBoard(session)).toEqual(board);

      // A change that breaks a rule is refused whole: here the man taken off stays in a slot.
      const wrong = board.setup.slots.map((pid, i) => (i === 3 ? sub : pid));
      await expect(
        changeLive(session, { subs: [{ outPid: out, inPid: sub }], slots: wrong }, 0),
      ).rejects.toThrow(/on the pitch/);
      expect(getLiveBoard(session)).toEqual(board);

      // Neither touched the match or its random stream.
      const end = await stepLive(session, Infinity, 0, false);
      expect(JSON.stringify(session.cache.get("matches", end.fid)?.result)).toBe(
        JSON.stringify(plain.session.cache.get("matches", reference.fid)?.result),
      );
    },
  );

  it(
    "pauses before extra time and at its half-time in a level knockout tie",
    { timeout: 120_000 },
    async () => {
      const { session } = await league("Extra time");
      const game = session.cache.get("meta", "game") as GameMeta;
      const season = loadSeason(session);
      const world = loopWorld(session, game.season);
      const fixture = season.fixtures.find((f) => f.homeCid === 0 || f.awayCid === 0);
      if (!fixture) throw new Error("no fixture");
      const { home, away } = squadPlay(
        season,
        world.clubs,
        world.players,
        game.userCid,
        competitions,
      ).prepare(fixture);
      const setup = fixtureSetup(season, fixture, competitions);
      let reasons: string[] = [];
      for (let i = 0; i < 60 && !reasons.includes("extraTimeBreak"); i++) {
        const state = startMatch({
          seed: `extra-time/${i}`,
          home,
          away,
          neutralVenue: false,
          style: setup.style,
          knockout: { extraTime: true, penalties: true, firstLeg: null },
          feed: true,
        });
        reasons = [];
        while (!state.finished) {
          const seen = state.feed.length;
          const period = state.period;
          stepMatch(state, 1);
          const pause = pauseFor(state.feed.slice(seen), 0, period, state);
          if (pause && pause.reason !== "injury" && pause.reason !== "redCard") {
            reasons.push(pause.reason);
          }
        }
      }
      expect(reasons).toEqual(["halfTime", "extraTime", "extraTimeBreak"]);
    },
  );
});
