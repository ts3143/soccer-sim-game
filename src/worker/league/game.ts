/**
 * The season loop inside a league save (SPEC §3): the phase machine, dated events and the
 * Play-menu actions, with every result saved through the cache.
 *
 * Phases: preseason (1 July to the first match) → regular season (every league, cup and
 * play-off match) → end of season (from the last match to 30 June). The end of season
 * has two steps the user takes: "Proceed to promotion/relegation" (1 June) and "Advance
 * to preseason" (1 July, a new season). Transfer windows are dated events inside the
 * phases, not phases of their own (England plays through the winter window).
 *
 * The game date is the last day already processed: its events have fired and its
 * matches are played. Each Play action processes days in order (events first, then
 * matches) and saves once at the end.
 */
import { addDays } from "../../common/dates";
import { competitionsConfig } from "../../common/config/competitions";
import {
  PLAYER_STAT_TOTALS,
  type ClubSeason,
  type Fixture,
  type GameMeta,
  type IdCounters,
  type PlayerStatsRow,
  type SeasonMeta,
} from "../../common/schema";
import type { MatchResult } from "../../common/match";
import type { GameState, PlayOption, PlayReport, SeasonEvent } from "../../common/api";
import { updateLeagueSummary } from "../db/globalDb";
import { seasonDate } from "../schedule/calendar";
import { resetForPreseason, squadPlay } from "../season/squads";
import {
  applyMoves,
  createSeason,
  type LastFinish,
  leagueTableOf,
  nextMatchDate,
  playDate,
  restoreSeason,
  seasonMetaOf,
  seasonOutcome,
  type SeasonState,
} from "../season/season";
import type { LeagueSession } from "./session";

const meta = <T>(session: LeagueSession, key: string): T => {
  const row = session.cache.get("meta", key) as T | undefined;
  if (row === undefined) throw new Error(`Save has no meta row "${key}"`);
  return row;
};

/** Dated events of a season (SPEC §3.1) besides matches: windows and the winter update. */
export function seasonEvents(season: number, config = competitionsConfig): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  for (const w of config.windows) {
    events.push({ date: seasonDate(season, w.opens), kind: "windowOpens", window: w.id });
    events.push({ date: seasonDate(season, w.closes), kind: "windowCloses", window: w.id });
  }
  const winter = config.keyDates.winterDevelopmentUpdate;
  if (winter) events.push({ date: seasonDate(season, winter), kind: "winterUpdate" });
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The window open on `date` (opening day included, the day after deadline day not). */
export function openWindow(date: string, season: number, config = competitionsConfig) {
  for (const w of config.windows) {
    const opens = seasonDate(season, w.opens);
    const closes = seasonDate(season, w.closes);
    if (date >= opens && date < closes) return { id: w.id, closes };
  }
  return null;
}

function loadSeason(session: LeagueSession): SeasonState {
  const game = meta<GameMeta>(session, "game");
  const stored = meta<SeasonMeta>(session, "season");
  const ids = meta<IdCounters>(session, "ids");
  const fixtures = session.cache.getAll("fixtures").filter((f) => f.season === stored.season);
  return restoreSeason(stored, game.seed, fixtures, ids.fid);
}

function saveSeason(session: LeagueSession, state: SeasonState, movesApplied: boolean) {
  const ids = meta<IdCounters>(session, "ids");
  session.cache.put("meta", { ...ids, fid: state.nextFid }, "ids");
  session.cache.put(
    "meta",
    { ...seasonMetaOf(state), movesApplied } satisfies SeasonMeta,
    "season",
  );
}

/** Last season's finishes, from the club-season rows. */
function lastFinishes(session: LeagueSession, season: number): Map<number, LastFinish> {
  const out = new Map<number, LastFinish>();
  for (const row of session.cache.getAll("clubSeasons")) {
    if (row.season === season - 1 && row.finish !== null) {
      out.set(row.cid, { leagueId: row.leagueId, position: row.finish });
    }
  }
  return out;
}

/**
 * Sets up the current season's competitions if the save has none yet: a new league, or
 * a save made before M3. Saves through the cache (the caller flushes).
 */
export function ensureSeason(session: LeagueSession): void {
  if (session.cache.get("meta", "season") !== undefined) return;
  const game = meta<GameMeta>(session, "game");
  const ids = meta<IdCounters>(session, "ids");
  const state = createSeason({
    season: game.season,
    seed: game.seed,
    clubs: session.cache.getAll("clubs"),
    lastFinish: lastFinishes(session, game.season),
    firstFid: ids.fid,
  });
  for (const f of state.fixtures) session.cache.put("fixtures", f);
  saveSeason(session, state, false);
}

export function gameState(session: LeagueSession): GameState {
  const game = meta<GameMeta>(session, "game");
  const stored = meta<SeasonMeta>(session, "season");
  const window = openWindow(game.date, game.season);
  const options: PlayOption[] = [];
  if (game.phase === "endOfSeason") {
    options.push(stored.movesApplied ? "advanceToPreseason" : "proceedToPromotionRelegation");
  } else {
    options.push("untilNextMatch", "oneWeek");
    if (window) options.push("untilWindowCloses");
    options.push("untilEndOfSeason");
  }
  const next = session.cache
    .getAll("fixtures")
    .filter(
      (f) =>
        f.season === game.season &&
        !f.result &&
        (f.homeCid === game.userCid || f.awayCid === game.userCid),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid))[0];
  return {
    season: game.season,
    phase: game.phase,
    date: game.date,
    window,
    options,
    nextUserFixture: next ?? null,
  };
}

function emptyStats(pid: number, season: number, cid: number, competition: string): PlayerStatsRow {
  const row = {
    pid,
    season,
    cid,
    competition,
    appearances: 0,
    starts: 0,
    cleanSheets: 0,
    ratingTotal: 0,
  };
  return { ...row, ...Object.fromEntries(PLAYER_STAT_TOTALS.map((k) => [k, 0])) } as PlayerStatsRow;
}

/** Saves a played fixture: the fixture, its match record and the players' season totals. */
function recordMatch(session: LeagueSession, fixture: Fixture, result: MatchResult): void {
  const { cache } = session;
  cache.put("fixtures", fixture);
  cache.put("matches", {
    fid: fixture.fid,
    season: fixture.season,
    date: fixture.date,
    competition: fixture.competition,
    round: fixture.round,
    homeCid: fixture.homeCid,
    awayCid: fixture.awayCid,
    result,
  });
  for (const p of result.players) {
    const cid = p.side === 0 ? fixture.homeCid : fixture.awayCid;
    const key: [number, number, number, string] = [p.pid, fixture.season, cid, fixture.competition];
    const row = cache.get("playerStats", key) ?? emptyStats(...key);
    row.appearances++;
    if (p.startedInSlot !== null) row.starts++;
    if (p.cleanSheet) row.cleanSheets++;
    row.ratingTotal += p.rating;
    for (const stat of PLAYER_STAT_TOTALS) row[stat] += p[stat];
    cache.put("playerStats", row);
  }
}

/** Writes each league club's W/D/L, goals and points (and, at the end, its finish). */
function updateClubSeasons(session: LeagueSession, state: SeasonState, final: boolean): void {
  for (const leagueId of Object.keys(state.leagueClubs)) {
    for (const row of leagueTableOf(state, leagueId)) {
      const key: [number, number] = [row.cid, state.season];
      const current = session.cache.get("clubSeasons", key);
      if (!current) continue;
      const next: ClubSeason = {
        ...current,
        leagueId,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
        finish: final ? row.position : null,
      };
      session.cache.put("clubSeasons", next);
    }
  }
}

/**
 * Processes days after the game date, in order, until `stop` says so, `limit` is
 * reached or the season's matches are over. Returns what happened.
 */
function processDays(
  session: LeagueSession,
  limit: string | null,
  stop: (day: { date: string; fixtures: Fixture[] }) => boolean,
): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const stored = meta<SeasonMeta>(session, "season");
  const clubs = session.cache.getAll("clubs");
  // The cached player objects: the squad AI updates condition and injuries in place.
  const players = session.cache.getAll("players");
  const squads = squadPlay(state, clubs, players);
  const engine = squads.play;
  const events = seasonEvents(game.season);
  const report: PlayReport = {
    from: game.date,
    to: game.date,
    matchesPlayed: 0,
    events: [],
    phase: game.phase,
  };
  const results = new Map<number, MatchResult>();
  const play: Parameters<typeof playDate>[2] = (fixture, setup) => {
    const result = engine(fixture, setup);
    results.set(fixture.fid, result);
    return result;
  };

  for (;;) {
    const nextMatch = nextMatchDate(state);
    const nextEvent = events.find((e) => e.date > game.date)?.date ?? null;
    const candidates = [nextMatch, nextEvent].filter((d): d is string => d !== null);
    if (nextMatch === null) break; // the season's matches are over
    const day = candidates.reduce((a, b) => (a < b ? a : b));
    if (limit !== null && day > limit) break;

    report.events.push(...events.filter((e) => e.date === day));
    const before = state.fixtures.length;
    const played = playDate(state, day, play);
    for (const fixture of played)
      recordMatch(session, fixture, results.get(fixture.fid) as MatchResult);
    for (const fixture of state.fixtures.slice(before)) session.cache.put("fixtures", fixture);
    if (played.length > 0 && game.phase === "preseason") game.phase = "regularSeason";
    report.matchesPlayed += played.length;
    game.date = day;
    if (stop({ date: day, fixtures: played })) break;
  }

  if (nextMatchDate(state) === null) {
    game.phase = "endOfSeason";
  } else if (limit !== null && limit > game.date) {
    report.events.push(...events.filter((e) => e.date > game.date && e.date <= limit));
    game.date = limit;
  }
  for (const p of players) if (squads.changed.has(p.pid)) session.cache.put("players", p);
  updateClubSeasons(session, state, game.phase === "endOfSeason");
  saveSeason(session, state, stored.movesApplied);
  session.cache.put("meta", game, "game");
  report.to = game.date;
  report.phase = game.phase;
  return report;
}

/** 1 June: promotion and relegation (SPEC §3.1). */
function proceedToPromotionRelegation(session: LeagueSession): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const outcome = seasonOutcome(state);
  const clubs = session.cache.getAll("clubs").map((c) => ({ ...c }));
  applyMoves(clubs, outcome.moves);
  for (const club of clubs) session.cache.put("clubs", club);
  const from = game.date;
  const processing = seasonDate(
    game.season,
    competitionsConfig.keyDates.endOfSeasonProcessing ?? "06-01",
  );
  if (processing > game.date) game.date = processing;
  session.cache.put("meta", game, "game");
  saveSeason(session, state, true);
  return { from, to: game.date, matchesPlayed: 0, events: [], phase: game.phase };
}

/**
 * Match records are kept for the current and previous season, and forever when the
 * user's club played (SPEC §12). Deletes the rest, straight from IndexedDB.
 */
export async function pruneMatchRecords(
  db: LeagueSession["db"],
  season: number,
  userCid: number,
): Promise<number> {
  const tx = db.transaction("matches", "readwrite");
  let deleted = 0;
  let cursor = await tx.store.index("season").openCursor(IDBKeyRange.upperBound(season - 2));
  while (cursor) {
    const m = cursor.value;
    if (m.homeCid !== userCid && m.awayCid !== userCid) {
      await cursor.delete();
      deleted++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}

/** 1 July: a new season starts (SPEC §3.1). */
async function advanceToPreseason(session: LeagueSession): Promise<PlayReport> {
  const { cache, db } = session;
  const game = { ...meta<GameMeta>(session, "game") };
  const from = game.date;
  const old = game.season;
  const season = old + 1;

  for (const club of cache.getAll("clubs")) {
    const last = cache.get("clubSeasons", [club.cid, old]);
    cache.put("clubSeasons", {
      cid: club.cid,
      season,
      leagueId: club.leagueId,
      hype: last?.hype ?? 50,
      reputation: last?.reputation ?? 50,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      finish: null,
      revenue: {},
      expenses: {},
      cashEnd: null,
      boardExpectation: null,
      boardConfidence: null,
      squadCostRatio: null,
    });
  }
  game.season = season;
  game.phase = "preseason";
  game.date = `${season}-07-01`;
  // Preseason: everyone back to full condition (SPEC §3.1); long injuries carry on.
  for (const p of cache.getAll("players")) {
    if (resetForPreseason(p, game.date)) cache.put("players", p);
  }
  cache.put("meta", game, "game");
  cache.delete("meta", "season");
  ensureSeason(session);

  // Last season's rows stay in IndexedDB; drop them from memory once saved.
  await cache.flush();
  cache.evict("fixtures", (f) => f.season < season);
  cache.evict("matches", (m) => m.season < season);
  cache.evict("playerStats", (r) => r.season < season);

  await pruneMatchRecords(db, season, game.userCid);
  return { from, to: game.date, matchesPlayed: 0, events: [], phase: game.phase };
}

/** Play actions on a save run one at a time, even when two tabs press Play together. */
const queues = new WeakMap<LeagueSession, Promise<unknown>>();

/** Runs one Play-menu action and saves the result. */
export function play(session: LeagueSession, option: PlayOption): Promise<PlayReport> {
  const previous = queues.get(session) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => runPlay(session, option));
  queues.set(session, run);
  return run;
}

async function runPlay(session: LeagueSession, option: PlayOption): Promise<PlayReport> {
  ensureSeason(session);
  const state = gameState(session);
  if (!state.options.includes(option)) {
    throw new Error(`"${option}" isn't available now (phase ${state.phase}, ${state.date})`);
  }
  const userCid = meta<GameMeta>(session, "game").userCid;
  let report: PlayReport;
  switch (option) {
    case "untilNextMatch":
      report = processDays(session, null, (day) =>
        day.fixtures.some((f) => f.homeCid === userCid || f.awayCid === userCid),
      );
      break;
    case "oneWeek":
      report = processDays(session, addDays(state.date, 7), () => false);
      break;
    case "untilWindowCloses":
      report = processDays(session, state.window?.closes ?? state.date, () => false);
      break;
    case "untilEndOfSeason":
      report = processDays(session, null, () => false);
      break;
    case "proceedToPromotionRelegation":
      report = proceedToPromotionRelegation(session);
      break;
    case "advanceToPreseason":
      report = await advanceToPreseason(session);
      break;
  }
  await session.cache.flush();
  const game = meta<GameMeta>(session, "game");
  await updateLeagueSummary(session.lid, {
    season: game.season,
    lastPlayedAt: new Date().toISOString(),
  });
  return report;
}
