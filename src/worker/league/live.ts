/**
 * Watching a match live (M6, SPEC §11 Watch live).
 *
 * "Watch your next match" plays every day before the user's next match, then that day's
 * events, market and training, and holds the day before its matches (runner `hold`).
 * The user's match then runs here possession by possession: he manages his club (his
 * saved line-up and sliders, injured players replaced by the AI's pick), the AI the
 * other. Its state is saved as it goes (meta row "live"), random stream included, so a
 * closed game resumes exactly where it was: no do-overs. At full time the held day is
 * finished with the live result (runner `resume`): the other matches, money, tables,
 * board and cup draws, through the same code as a simulated day.
 */
import type { LiveChanges, LiveMatchView, LiveTeamView, PlayReport } from "../../common/api";
import { formationById, formationsConfig, slotLabel } from "../../common/config/formations";
import type { Club, Fixture, GameMeta, Player } from "../../common/schema";
import { effectiveDials } from "../club/standing";
import { cleanSetup, selectable } from "../club/tactics";
import { maximizeAssignment } from "../core/assignment";
import { slotOvr } from "../core/ovr";
import { Random, type RandomState } from "../core/random";
import { updateLeagueSummary } from "../db/globalDb";
import { aiSliders } from "../engine/aiTactics";
import { COEFFICIENTS } from "../engine/coefficients";
import {
  applyChanges,
  matchMinute,
  matchResult,
  startMatch,
  stepMatch,
  type MatchState,
} from "../engine/match";
import { enginePlayer } from "../engine/prepare";
import type { EngineTeamInput, TeamSide } from "../engine/types";
import { fixtureSetup } from "../season/season";
import { currentCondition, isInjured, squadPlay } from "../season/squads";
import { competitionName, teamRef } from "../views/common";
import {
  assertNotLive,
  ensureSeason,
  gameState,
  loadSeason,
  loopWorld,
  meta,
  processDays,
  queued,
} from "./game";
import type { LeagueSession } from "./session";

/** The engine state as saved: its random stream as plain state, no coefficients. */
type SavedState = Omit<MatchState, "rng" | "c"> & { rng: RandomState };

interface LiveRow {
  fid: number;
  date: string;
  side: TeamSide;
  state: SavedState;
}

interface Running {
  row: Omit<LiveRow, "state">;
  state: MatchState;
  /** Match clock when the state was last saved. */
  savedClock: number;
}

/** Saved every few match minutes, at breaks, after changes and at the end. */
const SAVE_EVERY_SECONDS = 5 * 60;
const running = new WeakMap<LeagueSession, Running>();

function save(session: LeagueSession, live: Running): void {
  const plain: Record<string, unknown> = { ...live.state, rng: live.state.rng.getState() };
  delete plain.c;
  // A deep copy: the running state keeps changing after this.
  const state = structuredClone(plain) as SavedState;
  session.cache.put("meta", { ...live.row, state } satisfies LiveRow, "live");
  live.savedClock = live.state.clock;
}

function load(session: LeagueSession): Running {
  const known = running.get(session);
  if (known) return known;
  const row = session.cache.get("meta", "live") as LiveRow | undefined;
  if (!row) throw new Error("No live match is under way.");
  const copy = structuredClone(row.state);
  const state: MatchState = { ...copy, rng: Random.fromState(copy.rng), c: COEFFICIENTS };
  const live = {
    row: { fid: row.fid, date: row.date, side: row.side },
    state,
    savedClock: state.clock,
  };
  running.set(session, live);
  return live;
}

/** Tests: forget the running match, as a restarted worker would. */
export function forgetRunningMatch(session: LeagueSession): void {
  running.delete(session);
}

/**
 * The user's matchday squad for a watched match: his saved line-up (or the AI's pick),
 * with players who can't play today replaced by the best fit players left, the bench
 * topped up from the AI's, today's condition, his sliders, and no AI in-game changes.
 */
export function userTeamInput(
  club: Club,
  players: readonly Player[],
  fixture: Fixture,
  ai: EngineTeamInput,
): EngineTeamInput {
  const date = fixture.date;
  const opponent = fixture.homeCid === club.cid ? fixture.awayCid : fixture.homeCid;
  const medical = effectiveDials(club).medical;
  const available = selectable(players, club.cid, date).filter(
    (p) => !isInjured(p, date) && p.loan?.parentCid !== opponent,
  );
  const byPid = new Map(available.map((p) => [p.pid, p]));
  const formation = formationById(club.tactics.formation);
  const saved = club.tactics.lineup
    ? cleanSetup(
        {
          formation: formation.id,
          sliders: club.tactics.sliders,
          slots: club.tactics.lineup.slots,
          bench: club.tactics.lineup.bench,
        },
        new Set(byPid.keys()),
      )
    : null;
  let slots: (number | null)[] = saved ? [...saved.slots] : [...ai.lineup];
  const empty = slots.flatMap((pid, i) => (pid === null ? [i] : []));
  if (empty.length > 0) {
    const used = new Set(slots);
    const pool = available.filter((p) => !used.has(p.pid));
    if (pool.length >= empty.length) {
      const scores = empty.map((i) =>
        pool.map((p) => slotOvr(p, formation.slots[i] ?? formation.slots[0]!)),
      );
      maximizeAssignment(scores).forEach((j, k) => {
        slots[empty[k] as number] = (pool[j] as Player).pid;
      });
    } else {
      slots = [...ai.lineup]; // too few fit players for the saved shape: the AI's pick
    }
  }
  const xi = slots as number[];
  const inXi = new Set(xi);
  const bench: number[] = [];
  for (const pid of [...(saved?.bench ?? []), ...ai.bench, ...ai.lineup]) {
    if (bench.length >= formationsConfig.benchSize) break;
    if (!inXi.has(pid) && !bench.includes(pid) && byPid.has(pid)) bench.push(pid);
  }
  const named = [...xi, ...bench].map((pid) => byPid.get(pid)).filter((p) => p !== undefined);
  return {
    cid: club.cid,
    formation: formation.id,
    lineup: xi,
    bench,
    players: named.map((p) => ({
      ...enginePlayer(p),
      condition: currentCondition(p, date, medical),
    })),
    sliders: { ...club.tactics.sliders },
    aiInGame: false,
    medicalDial: medical,
  };
}

/**
 * Play → "Watch your next match". `controls: "ai"` (tests) lets the AI manage the user's
 * club as in a simulated match, so the watched path can be checked against the simulated one.
 */
export function watchNextMatch(
  session: LeagueSession,
  controls: "user" | "ai" = "user",
): Promise<PlayReport> {
  return queued(session, async () => {
    ensureSeason(session);
    assertNotLive(session);
    if (!gameState(session).options.includes("watchNextMatch")) {
      throw new Error("There is no match of yours to watch now.");
    }
    const userCid = meta<GameMeta>(session, "game").userCid;
    const report = processDays(session, null, () => false, {
      hold: (day, fixtures) =>
        fixtures.some(
          (f) => f.date === day && !f.result && (f.homeCid === userCid || f.awayCid === userCid),
        ),
    });
    const { held, ...played } = report;
    let live: number | null = null;
    if (held) {
      const game = meta<GameMeta>(session, "game");
      const season = loadSeason(session);
      const fixture = season.fixtures.find(
        (f) =>
          f.date === game.date && !f.result && (f.homeCid === userCid || f.awayCid === userCid),
      );
      if (!fixture) throw new Error("The match to watch is missing");
      const world = loopWorld(session, game.season);
      const club = world.clubs.find((c) => c.cid === userCid);
      if (!club) throw new Error("The save has no user club");
      const setup = fixtureSetup(season, fixture);
      const ai = squadPlay(season, world.clubs, world.players).prepare(fixture);
      const side: TeamSide = fixture.homeCid === userCid ? 0 : 1;
      const mine = side === 0 ? ai.home : ai.away;
      const user = controls === "ai" ? mine : userTeamInput(club, world.players, fixture, mine);
      const home = side === 0 ? user : ai.home;
      const away = side === 0 ? ai.away : user;
      const sliders = (team: EngineTeamInput, other: EngineTeamInput, isHome: boolean) =>
        team === user && controls === "user"
          ? team.sliders
          : aiSliders(team, other, isHome && !setup.neutral, setup.style.directness);
      const state = startMatch({
        seed: setup.seed,
        home: { ...home, sliders: sliders(home, away, true) },
        away: { ...away, sliders: sliders(away, home, false) },
        neutralVenue: setup.neutral,
        style: setup.style,
        knockout: setup.knockout,
        feed: true,
      });
      const started: Running = {
        row: { fid: fixture.fid, date: fixture.date, side },
        state,
        savedClock: 0,
      };
      running.set(session, started);
      save(session, started);
      live = fixture.fid;
    }
    await session.cache.flush();
    await updateLeagueSummary(session.lid, { lastPlayedAt: new Date().toISOString() });
    return { ...played, live };
  });
}

/** Full time: the held day is finished with the live result and saved (runner `resume`). */
async function finishDay(session: LeagueSession, live: Running): Promise<PlayReport> {
  const result = matchResult(live.state);
  const report: PlayReport = processDays(session, live.row.date, () => false, {
    resume: { date: live.row.date, results: new Map([[live.row.fid, result]]) },
  });
  delete (report as { held?: boolean }).held;
  session.cache.delete("meta", "live");
  running.delete(session);
  await session.cache.flush();
  await updateLeagueSummary(session.lid, { lastPlayedAt: new Date().toISOString() });
  return { ...report, live: null };
}

export function stepLive(
  session: LeagueSession,
  possessions: number,
  from: number,
): Promise<LiveMatchView> {
  return queued(session, async () => {
    const live = load(session);
    stepMatch(live.state, Math.max(1, Math.floor(possessions)));
    if (live.state.finished) {
      const view = liveView(session, live, from);
      return { ...view, report: await finishDay(session, live) };
    }
    if (live.state.atBreak || live.state.clock - live.savedClock >= SAVE_EVERY_SECONDS) {
      save(session, live);
      await session.cache.flush();
    }
    return liveView(session, live, from);
  });
}

export function changeLive(
  session: LeagueSession,
  changes: LiveChanges,
  from: number,
): Promise<LiveMatchView> {
  return queued(session, async () => {
    const live = load(session);
    applyChanges(live.state, live.row.side, changes);
    save(session, live);
    await session.cache.flush();
    return liveView(session, live, from);
  });
}

export function getLive(session: LeagueSession, from: number): LiveMatchView | null {
  if (session.cache.get("meta", "live") === undefined) return null;
  return liveView(session, load(session), from);
}

function liveView(session: LeagueSession, live: Running, from: number): LiveMatchView {
  const { state } = live;
  const fixture = session.cache.get("fixtures", live.row.fid);
  if (!fixture) throw new Error(`No fixture ${live.row.fid}`);
  const players: LiveMatchView["players"] = {};
  for (const team of state.teams) {
    for (const ps of team.all) {
      const p = session.cache.get("players", ps.input.pid);
      players[ps.input.pid] = {
        name: p ? `${p.firstName} ${p.lastName}`.trim() : `#${ps.input.pid}`,
        position: p?.position ?? "CM",
        shirtNumber: p?.shirtNumber ?? null,
      };
    }
  }
  const totalPossession = state.teams[0].possessionSeconds + state.teams[1].possessionSeconds;
  const team = (side: TeamSide): LiveTeamView => {
    const t = state.teams[side];
    const club = session.cache.get("clubs", t.input.cid);
    return {
      team: teamRef(club),
      formation: t.plan.formation.id,
      sliders: { ...t.sliders },
      user: side === live.row.side,
      stats: {
        shots: t.stats.shots,
        shotsOnTarget: t.stats.shotsOnTarget,
        xg: Math.round(t.stats.xg * 100) / 100,
        possession: totalPossession > 0 ? t.possessionSeconds / totalPossession : 0.5,
        passes: t.stats.passes,
        passesCompleted: t.stats.passesCompleted,
        corners: t.stats.corners,
        fouls: t.stats.fouls,
        yellowCards: t.stats.yellowCards,
        redCards: t.stats.redCards,
      },
      onPitch: t.slots.map((ps, i) =>
        ps
          ? {
              pid: ps.input.pid,
              slot: slotLabel(t.plan.formation.slots[i] ?? t.plan.formation.slots[0]!),
              energy: Math.round(ps.energy * 100),
              booked: ps.booked,
              injured: ps.injured,
            }
          : null,
      ),
      bench: t.bench.map((ps) => ({
        pid: ps.input.pid,
        position: players[ps.input.pid]?.position ?? "CM",
        energy: Math.round(ps.energy * 100),
      })),
      subsUsed: t.stats.subsUsed,
      subLimit: t.subLimit,
      windowsUsed: t.stats.windowsUsed,
      windowLimit: t.windowLimit,
    };
  };
  return {
    fid: fixture.fid,
    date: fixture.date,
    competition: fixture.competition,
    competitionName: competitionName(fixture.competition),
    round: fixture.round,
    leg: fixture.leg ?? null,
    userSide: live.row.side,
    score: [state.score[0], state.score[1]],
    shootout: state.shootout ? [state.shootout[0], state.shootout[1]] : null,
    clock: state.clock,
    minute: matchMinute(state.clock),
    period: state.period,
    atBreak: state.atBreak,
    finished: state.finished,
    events: state.feed.slice(Math.max(0, from)),
    feedLength: state.feed.length,
    teams: [team(0), team(1)],
    players,
    report: null,
  };
}
