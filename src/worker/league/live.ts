/**
 * Watching a match live (M6, SPEC §11 Watch live).
 *
 * "Watch your next match" plays every day before the user's next match, then that day's
 * events, market and training, and holds the day before its matches (runner `hold`).
 * The user's match then runs here possession by possession: he manages his club, the AI
 * the other. It starts from his saved tactics as they are; before kick-off he can change
 * them for this match, and it can't kick off while his line-up names a player who can't
 * play today or has an empty slot (T, 2026-10-25). Its state is saved as it goes (meta row "live"), random stream included, so a
 * closed game resumes exactly where it was: no do-overs. At full time the held day is
 * finished with the live result (runner `resume`): the other matches, money, tables,
 * board and cup draws, through the same code as a simulated day.
 */
import type {
  LiveBoardView,
  LiveChanges,
  LiveMatchView,
  LivePause,
  LiveTeamView,
  PlayReport,
  TacticsMode,
  TacticsSetup,
  TacticsView,
} from "../../common/api";
import type { CompetitionsConfig } from "../../common/config/competitions";
import { formationById, formationsConfig, slotLabel } from "../../common/config/formations";
import type { Club, Fixture, GameMeta, Player } from "../../common/schema";
import { effectiveDials } from "../club/standing";
import { isSuspended } from "../season/discipline";
import { checkSetup, cleanSetup, currentSetup, reslot, selectable } from "../club/tactics";
import { maximizeAssignment } from "../core/assignment";
import { slotOvr } from "../core/ovr";
import { Random, type RandomState } from "../core/random";
import { updateLeagueSummary } from "../db/globalDb";
import { aiSliders } from "../engine/aiTactics";
import { COEFFICIENTS } from "../engine/coefficients";
import {
  applyChanges,
  MatchChangeError,
  matchMinute,
  matchResult,
  ratingSoFar,
  startMatch,
  stepMatch,
  type MatchState,
} from "../engine/match";
import { currentMinute, onPitch as onPitchOf } from "../engine/state";
import { enginePlayer } from "../engine/prepare";
import type { EngineTeamInput, MatchEvent, Period, TeamSide } from "../engine/types";
import type { MatchResult } from "../../common/match";
import { fixtureSetup } from "../season/season";
import { currentCondition, isInjured, squadPlay } from "../season/squads";
import { competitionName, teamRef } from "../views/common";
import { ratingRows, tacticsView } from "../views/tactics";
import {
  assertNotLive,
  ensureSeason,
  gameState,
  loadSeason,
  loopWorld,
  meta,
  playing,
  processDays,
  queued,
} from "./game";
import type { LeagueSession } from "./session";
import { GameError } from "../../common/errors";

/** The engine state as saved: its random stream as plain state, no coefficients. */
type SavedState = Omit<MatchState, "rng" | "c"> & { rng: RandomState };

interface LiveRow {
  fid: number;
  date: string;
  side: TeamSide;
  state: SavedState;
  /**
   * Before kick-off, the user's line-up while it can't start the match (`kickOffProblems`).
   * The state holds a playable stand-in until he fixes it. Absent or null: it can start.
   */
  draft?: TacticsSetup | null;
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

/** The engine state as plain data, its random stream as state: a deep copy. */
function plainState(state: MatchState): SavedState {
  const plain: Record<string, unknown> = { ...state, rng: state.rng.getState() };
  delete plain.c;
  return structuredClone(plain) as SavedState;
}

/** A running engine state from plain data: a deep copy. */
function restoreState(saved: SavedState): MatchState {
  const copy = structuredClone(saved);
  return { ...copy, rng: Random.fromState(copy.rng), c: COEFFICIENTS };
}

function save(session: LeagueSession, live: Running): void {
  // A deep copy: the running state keeps changing after this.
  session.cache.put(
    "meta",
    { ...live.row, state: plainState(live.state) } satisfies LiveRow,
    "live",
  );
  live.savedClock = live.state.clock;
}

function load(session: LeagueSession): Running {
  const known = running.get(session);
  if (known) return known;
  const row = session.cache.get("meta", "live") as LiveRow | undefined;
  if (!row) throw new GameError("No live match is under way.");
  const state = restoreState(row.state);
  const live = {
    row: { fid: row.fid, date: row.date, side: row.side, draft: row.draft ?? null },
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

/** Who can play for the user's club in this match: fit, pickable, not on loan from the opponent. */
function availableFor(
  club: Club,
  players: readonly Player[],
  fixture: Fixture,
  config: CompetitionsConfig,
): Player[] {
  const opponent = fixture.homeCid === club.cid ? fixture.awayCid : fixture.homeCid;
  return selectable(players, club.cid, fixture.date, config).filter(
    (p) => !isInjured(p, fixture.date) && !isSuspended(p) && p.loan?.parentCid !== opponent,
  );
}

const setupOf = (input: EngineTeamInput): TacticsSetup => ({
  formation: input.formation,
  sliders: { ...input.sliders },
  slots: [...input.lineup],
  bench: [...input.bench],
});

/**
 * A matchday squad from a line-up: empty slots get the best fit players left (the AI's
 * XI if too few are left), the bench is kept and topped up from `topUp`, condition is
 * today's, and the AI makes no in-game changes (the user does).
 */
function inputFromSetup(
  club: Club,
  setup: TacticsSetup,
  available: readonly Player[],
  date: string,
  fallbackXi: readonly number[],
  topUp: readonly number[],
): EngineTeamInput {
  const medical = effectiveDials(club).medical;
  const byPid = new Map(available.map((p) => [p.pid, p]));
  const formation = formationById(setup.formation);
  let slots = [...setup.slots];
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
      slots = [...fallbackXi]; // too few fit players for this shape: the AI's pick
    }
  }
  const xi = slots as number[];
  const inXi = new Set(xi);
  const bench: number[] = [];
  for (const pid of [...setup.bench, ...topUp]) {
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
    sliders: { ...setup.sliders },
    aiInGame: false,
    medicalDial: medical,
  };
}

/**
 * The engine input for the user's line-up. One that can't start the match yet gets a
 * playable stand-in until he fixes it: players who can't play left out, empty slots
 * filled and the bench topped up from the AI's pick.
 */
function userInput(ctx: PreMatch, setup: TacticsSetup, ai: EngineTeamInput): EngineTeamInput {
  const ready = kickOffProblems(setup, ctx).length === 0;
  const playable = cleanSetup(setup, new Set(ctx.available.map((p) => p.pid)));
  const topUp = ready ? [] : [...ai.bench, ...ai.lineup];
  return inputFromSetup(ctx.club, playable, ctx.available, ctx.fixture.date, ai.lineup, topUp);
}

/**
 * Why a line-up can't start the match (T, 2026-10-25): an empty slot, or a player in the
 * XI or on the bench who can't play today. Empty when it can.
 */
function kickOffProblems(setup: TacticsSetup, ctx: PreMatch): string[] {
  const ok = new Set(ctx.available.map((p) => p.pid));
  const slots = formationById(setup.formation).slots;
  const problems: string[] = [];
  const empty = setup.slots.filter((pid) => pid === null).length;
  if (empty > 0) problems.push(`${empty} slot${empty === 1 ? " is" : "s are"} empty.`);
  const places: [number | null, string][] = [
    ...setup.slots.map((pid, i): [number | null, string] => [
      pid,
      slots[i] ? slotLabel(slots[i]) : "XI",
    ]),
    ...setup.bench.map((pid): [number, string] => [pid, "bench"]),
  ];
  for (const [pid, place] of places) {
    if (pid === null || ok.has(pid)) continue;
    const p = ctx.everyone.get(pid);
    const why = !p
      ? "can't play for the club"
      : isInjured(p, ctx.fixture.date)
        ? "is injured"
        : isSuspended(p)
          ? "is suspended"
          : "can't play against his parent club";
    problems.push(`${p ? `${p.firstName} ${p.lastName}`.trim() : `#${pid}`} (${place}) ${why}.`);
  }
  return problems;
}

/** Restarts the match from kick-off with a new line-up (before kick-off only). */
function restart(live: Running, user: EngineTeamInput): void {
  const { input } = live.state;
  const userHome = live.row.side === 0;
  const opponent = userHome ? input.away : input.home;
  const sliders = aiSliders(
    opponent,
    user,
    !userHome && !input.neutralVenue,
    input.style.directness,
  );
  const them = { ...opponent, sliders };
  live.state = startMatch({ ...input, home: userHome ? user : them, away: userHome ? them : user });
}

const kickedOff = (state: MatchState) => state.clock > 0 || state.inPlaySeconds > 0;

type PreMatch = ReturnType<typeof preMatchContext>;

/** What the pre-match line-up editor needs: the fixture, the club and who can play. */
function preMatchContext(session: LeagueSession, fid: number, side: TeamSide) {
  const game = meta<GameMeta>(session, "game");
  const season = loadSeason(session);
  const world = loopWorld(session, game.season);
  const fixture = season.fixtures.find((f) => f.fid === fid);
  const club = world.clubs.find((c) => c.cid === game.userCid);
  if (!fixture || !club) throw new Error("The live match's fixture or club is missing");
  const competitions = world.config.competitions;
  const available = availableFor(club, world.players, fixture, competitions);
  const ids = new Set(available.map((p) => p.pid));
  /**
   * The AI's pick for the user's club in this match, in `formation`: from his saved
   * line-up as in a simulated match, or from scratch in another formation.
   */
  const aiPick = (formation: string) => {
    const clubs = world.clubs.map((c) =>
      c.cid === club.cid && formation !== c.tactics.formation
        ? { ...c, tactics: { formation, sliders: c.tactics.sliders } }
        : c,
    );
    const both = squadPlay(season, clubs, world.players, club.cid, competitions).prepare(fixture);
    return side === 0 ? both.home : both.away;
  };
  const everyone = selectable(world.players, club.cid, fixture.date, competitions);
  return {
    fixture,
    club,
    world,
    available,
    byPid: new Map(available.map((p) => [p.pid, p])),
    /** Everyone he can name in a line-up, including those who can't play today. */
    everyone: new Map(everyone.map((p) => [p.pid, p])),
    /** His players who can't play today. */
    unavailable: everyone.filter((p) => !ids.has(p.pid)),
    aiPick,
  };
}

/** The pre-match editor's view of a line-up: who can't play, and why it can't kick off. */
function preMatchView(session: LeagueSession, ctx: PreMatch, setup: TacticsSetup): TacticsView {
  const named = new Set([...setup.slots, ...setup.bench]);
  const view = tacticsView(
    ctx.club,
    setup,
    ctx.available,
    ctx.everyone,
    ctx.fixture.date,
    true,
    session.cache.getAll("playerStats").filter((r) => r.season === ctx.fixture.season),
    ctx.unavailable.filter((p) => !named.has(p.pid)),
  );
  return { ...view, cantStart: kickOffProblems(setup, ctx) };
}

const userSide = (live: Running) =>
  live.row.side === 0 ? live.state.input.home : live.state.input.away;

export function getLiveLineup(session: LeagueSession): TacticsView {
  const live = load(session);
  const ctx = preMatchContext(session, live.row.fid, live.row.side);
  return preMatchView(session, ctx, live.row.draft ?? setupOf(userSide(live)));
}

/**
 * Before kick-off: the user's line-up for this match only. One that can start the match
 * restarts it from kick-off; one that can't is kept as the draft. Players who can't play
 * may stay where he has them, but can't be brought in.
 */
export function setLiveLineup(
  session: LeagueSession,
  setup: TacticsSetup,
  mode: TacticsMode,
): Promise<TacticsView> {
  return queued(session, async () => {
    const live = load(session);
    if (kickedOff(live.state)) {
      throw new GameError("The match has kicked off: make changes at a pause.");
    }
    const ctx = preMatchContext(session, live.row.fid, live.row.side);
    const shown = live.row.draft ?? setupOf(userSide(live));
    const kept = [...shown.slots, ...shown.bench].filter(
      (pid): pid is number => pid !== null && ctx.everyone.has(pid),
    );
    const allowed = new Set([...ctx.byPid.keys(), ...kept]);
    let next: TacticsSetup;
    if (mode === "saved") {
      next = currentSetup(
        ctx.club,
        ctx.world.players,
        ctx.fixture.date,
        ctx.world.config.competitions,
      );
    } else if (mode === "auto") {
      next = { ...setupOf(ctx.aiPick(setup.formation)), sliders: { ...setup.sliders } };
    } else {
      const clean = cleanSetup({ ...setup, slots: [...setup.slots] }, allowed);
      next = mode === "reslot" ? reslot(clean, setup.formation, ctx.everyone) : clean;
    }
    checkSetup(next, new Set(ctx.everyone.keys()));
    if (kickOffProblems(next, ctx).length === 0) {
      const ai = ctx.aiPick(next.formation);
      restart(live, userInput(ctx, next, ai));
      live.row.draft = null;
    } else {
      live.row.draft = next;
    }
    save(session, live);
    await session.cache.flush();
    return preMatchView(session, ctx, live.row.draft ?? setupOf(userSide(live)));
  });
}

/**
 * Play → "Watch your next match". `controls: "ai"` (tests) lets the AI manage the user's
 * club as in a simulated match, so the watched path can be checked against the simulated one.
 */
export function watchNextMatch(
  session: LeagueSession,
  controls: "user" | "ai" = "user",
  onStart?: () => void,
): Promise<PlayReport> {
  return playing(
    session,
    "watchNextMatch",
    async () => {
      ensureSeason(session);
      assertNotLive(session);
      if (!gameState(session).options.includes("watchNextMatch")) {
        throw new GameError("There is no match of yours to watch now.");
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
        const competitions = world.config.competitions;
        const setup = fixtureSetup(season, fixture, competitions);
        const ai = squadPlay(season, world.clubs, world.players, userCid, competitions).prepare(
          fixture,
        );
        const side: TeamSide = fixture.homeCid === userCid ? 0 : 1;
        const mine = side === 0 ? ai.home : ai.away;
        // His saved tactics as they are (T, 2026-10-25): a draft if they can't start it.
        const ctx = preMatchContext(session, fixture.fid, side);
        const saved = currentSetup(club, world.players, fixture.date, competitions);
        const draft = controls === "user" && kickOffProblems(saved, ctx).length > 0 ? saved : null;
        const user = controls === "ai" ? mine : userInput(ctx, saved, mine);
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
          row: { fid: fixture.fid, date: fixture.date, side, draft },
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
    },
    onStart,
  );
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

/**
 * Why play stopped by itself (the user's call: auto-pause): a break (half-time, before
 * extra time, its half-time), or one of the user's players injured or sent off. Pure, for tests.
 */
export function pauseFor(
  events: readonly MatchEvent[],
  side: TeamSide,
  periodBefore: Period,
  state: Pick<MatchState, "atBreak" | "finished" | "period">,
): LivePause | null {
  for (const e of events) {
    if (e.type === "injury" && e.side === side && !e.replaced) {
      return { reason: "injury", pid: e.pid };
    }
    if (e.type === "card" && e.side === side && e.card !== "yellow") {
      return { reason: "redCard", pid: e.pid };
    }
  }
  if (state.finished || !state.atBreak || state.period === periodBefore) return null;
  if (state.period === "second") return { reason: "halfTime", pid: null };
  if (state.period === "extraFirst") return { reason: "extraTime", pid: null };
  if (state.period === "extraSecond") return { reason: "extraTimeBreak", pid: null };
  return null;
}

/**
 * Plays up to `possessions` possessions. With `autoPause` it stops early at a break or
 * when one of the user's players is injured or sent off (the view says why); without it
 * ("To full time") it plays straight on. At full time the day is finished and saved.
 */
export function stepLive(
  session: LeagueSession,
  possessions: number,
  from: number,
  autoPause = true,
): Promise<LiveMatchView> {
  return queued(session, async () => {
    const live = load(session);
    const { state } = live;
    if (live.row.draft && !kickedOff(state)) {
      const ctx = preMatchContext(session, live.row.fid, live.row.side);
      const problems = kickOffProblems(live.row.draft, ctx).join(" ");
      throw new GameError(
        `Your line-up can't start the match. ${problems} Change it, or press Auto.`,
      );
    }
    const target = Math.max(1, Math.floor(possessions));
    let pause: LivePause | null = null;
    if (!autoPause) stepMatch(state, target);
    else {
      for (let n = 0; n < target && !state.finished && pause === null; n++) {
        const seen = state.feed.length;
        const period = state.period;
        stepMatch(state, 1);
        pause = pauseFor(state.feed.slice(seen), live.row.side, period, state);
      }
    }
    if (state.finished) {
      const view = liveView(session, live, from);
      return { ...view, report: await finishDay(session, live) };
    }
    if (pause !== null || state.atBreak || state.clock - live.savedClock >= SAVE_EVERY_SECONDS) {
      save(session, live);
      await session.cache.flush();
    }
    return { ...liveView(session, live, from), pause };
  });
}

/**
 * The match as it would be after the user's changes: a copy, so a change that breaks a
 * rule leaves the match as it was, and a preview touches nothing (random stream included).
 */
function changedCopy(live: Running, changes: LiveChanges): MatchState {
  const copy = restoreState(plainState(live.state));
  try {
    applyChanges(copy, live.row.side, changes);
  } catch (error) {
    if (error instanceof MatchChangeError) throw new GameError(`${error.message}.`);
    throw error;
  }
  return copy;
}

/** The user's changes at a pause: all of them, or none if one breaks a rule. */
export function changeLive(
  session: LeagueSession,
  changes: LiveChanges,
  from: number,
): Promise<LiveMatchView> {
  return queued(session, async () => {
    const live = load(session);
    live.state = changedCopy(live, changes);
    save(session, live);
    await session.cache.flush();
    return liveView(session, live, from);
  });
}

/**
 * The pause screen's tactics board (T, 2026-10-21): the user's side through the Tactics
 * view (slots, the substitutes left, no reserves), with the engine's team ratings now
 * (energy counted, the hidden form on the day left out) and each player's match so far.
 */
function liveBoard(session: LeagueSession, live: Running, state: MatchState): LiveBoardView {
  const team = state.teams[live.row.side];
  const club = session.cache.get("clubs", team.input.cid);
  if (!club) throw new Error(`No club ${team.input.cid}`);
  const date = live.row.date;
  const byPid = new Map(
    team.all.flatMap((ps) => {
      const p = session.cache.get("players", ps.input.pid);
      return p ? [[p.pid, p] as const] : [];
    }),
  );
  const setup: TacticsSetup = {
    formation: team.plan.formation.id,
    sliders: { ...team.sliders },
    slots: team.slots.map((ps) => ps?.input.pid ?? null),
    bench: team.bench.map((ps) => ps.input.pid),
  };
  const named = [...setup.slots, ...setup.bench].flatMap((pid) => {
    const p = pid === null ? undefined : byPid.get(pid);
    return p ? [p] : [];
  });
  const season = session.cache.get("fixtures", live.row.fid)?.season;
  const stats = session.cache.getAll("playerStats").filter((r) => r.season === season);
  const view = tacticsView(club, setup, named, byPid, date, true, stats);

  const minute = currentMinute(state);
  const match: LiveBoardView["match"] = {};
  for (const ps of [...onPitchOf(team), ...team.bench]) {
    match[ps.input.pid] = {
      energy: Math.round(ps.energy * 100),
      booked: ps.booked,
      injured: ps.injured,
      injuryDays: ps.stats.injuryDays,
      minutes: ps.onMinute === null ? 0 : Math.max(0, (ps.offMinute ?? minute) - ps.onMinute),
      goals: ps.stats.goals,
      assists: ps.stats.assists,
      rating: ratingSoFar(state, ps),
    };
  }

  const name = (pid: number) => view.slots.find((s) => s.player?.pid === pid)?.player?.name;
  const warnings: string[] = [];
  const empty = setup.slots.filter((pid) => pid === null).length;
  if (empty > 0)
    warnings.push(
      `You're down to ${11 - empty}: ${empty === 1 ? "a slot stays" : `${empty} slots stay`} empty.`,
    );
  const keeperSlot = team.plan.formation.slots.findIndex((s) => s.position === "GK");
  const inGoal = view.slots[keeperSlot]?.player;
  if (inGoal && inGoal.position !== "GK")
    warnings.push(`${inGoal.name}, an outfielder, is in goal.`);
  for (const ps of onPitchOf(team)) {
    const who = name(ps.input.pid) ?? `#${ps.input.pid}`;
    if (ps.injured)
      warnings.push(`${who} is injured: bring someone on, or he plays on at low energy.`);
    else if (ps.energy < LOW_ENERGY)
      warnings.push(`${who} is tiring (${Math.round(ps.energy * 100)}% energy).`);
  }

  // The engine's ratings carry the hidden form on the day; the board shows them without it.
  const ratings = { ...team.ratings };
  for (const key of Object.keys(ratings) as (keyof typeof ratings)[]) ratings[key] -= team.form;
  return {
    ...view,
    saved: true,
    reserves: [],
    benchSize: setup.bench.length,
    ratings: ratingRows(ratings),
    warnings,
    match,
    subsLeft: team.subLimit - team.stats.subsUsed,
    windowsLeft: team.windowLimit - team.stats.windowsUsed,
    free: state.atBreak,
  };
}

/** Below this energy the board warns that a player is tiring. */
const LOW_ENERGY = 0.5;

export function getLiveBoard(session: LeagueSession): LiveBoardView {
  const live = load(session);
  return liveBoard(session, live, live.state);
}

/** The board after these changes, on a copy: nothing is changed or saved. */
export function previewLiveChanges(session: LeagueSession, changes: LiveChanges): LiveBoardView {
  const live = load(session);
  return liveBoard(session, live, changedCopy(live, changes));
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
        ovr: p?.ovr ?? 0,
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
              injuryDays: ps.stats.injuryDays,
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
    competitionName: competitionName(session.config.competitions, fixture.competition),
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
    pause: null,
    report: null,
    motm: state.finished ? manOfTheMatchOf(matchResult(state)) : null,
  };
}

function manOfTheMatchOf(result: MatchResult): LiveMatchView["motm"] {
  const p = result.players.find((x) => x.pid === result.motm);
  return p ? { pid: p.pid, rating: p.rating } : null;
}
