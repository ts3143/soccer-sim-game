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
import { addDays, exactAge } from "../../common/dates";
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
import type { ContractTalks, GameState, PlayOption, PlayReport } from "../../common/api";
import { updateLeagueSummary } from "../db/globalDb";
import { seasonDate } from "../schedule/calendar";
import {
  endOfSeasonTurnover,
  type LoopWorld,
  type NewTransaction,
  seasonAwards,
  summerTransition,
} from "../season/offseason";
import { closeSeasonBooks, openSeasonBooks, settleMonths } from "../finance/finance";
import { BOARD, jobOffers, preseasonBoard } from "../club/board";
import { clubStrength } from "../club/standing";
import { contractAsks, contractEnd, marketValue, signContract, yearsLeft } from "../market/market";
import { clubRevenue, moodAtClub } from "../market/renewals";
import { runDays, type NewMessage } from "../season/runner";
import {
  applyMoves,
  createSeason,
  type LastFinish,
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

/** The window open on `date` (opening day included, the day after deadline day not). */
export function openWindow(date: string, season: number, config = competitionsConfig) {
  for (const w of config.windows) {
    const opens = seasonDate(season, w.opens);
    const closes = seasonDate(season, w.closes);
    if (date >= opens && date < closes) return { id: w.id, closes };
  }
  return null;
}

/** The save's clubs and players as the in-memory season code works on them (cache objects). */
function loopWorld(session: LeagueSession, season: number): LoopWorld {
  const game = meta<GameMeta>(session, "game");
  const ids = { ...meta<IdCounters>(session, "ids") };
  const reputation = new Map<number, number>();
  const clubSeasons = new Map<number, ClubSeason>();
  for (const row of session.cache.getAll("clubSeasons")) {
    if (row.season !== season) continue;
    reputation.set(row.cid, row.reputation);
    clubSeasons.set(row.cid, row);
  }
  return {
    clubs: session.cache.getAll("clubs"),
    players: session.cache.getAll("players"),
    reputation,
    clubSeasons,
    userCid: game.userCid,
    seed: game.seed,
    nextPid: () => {
      const pid = ids.pid++;
      session.cache.put("meta", { ...meta<IdCounters>(session, "ids"), pid: ids.pid }, "ids");
      return pid;
    },
  };
}

/** Saves the clubs and club-season rows the season code changed in place (cash, books). */
function saveBooks(session: LeagueSession, world: LoopWorld): void {
  for (const club of world.clubs) session.cache.put("clubs", club);
  for (const row of world.clubSeasons.values()) session.cache.put("clubSeasons", row);
}

function saveTransactions(session: LeagueSession, rows: readonly NewTransaction[]): void {
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const row of rows) session.cache.put("transactions", { xid: ids.xid++, ...row });
  session.cache.put("meta", ids, "ids");
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
  // The board's targets for the season (SPEC §6.5).
  const world = loopWorld(session, game.season);
  const message = preseasonBoard(world, game.season, game.date);
  saveBooks(session, world);
  if (message) saveMessages(session, [message]);
}

function saveMessages(session: LeagueSession, rows: readonly NewMessage[]): void {
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const row of rows) session.cache.put("inbox", { mid: ids.mid++, ...row });
  session.cache.put("meta", ids, "ids");
}

export function gameState(session: LeagueSession): GameState {
  const game = meta<GameMeta>(session, "game");
  const stored = meta<SeasonMeta>(session, "season");
  const window = openWindow(game.date, game.season);
  const options: PlayOption[] = [];
  if (game.fired) {
    // Sacked: nothing to play until the user takes a job (acceptJobOffer).
  } else if (game.phase === "endOfSeason") {
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
    fired: game.fired
      ? {
          date: game.fired.date,
          offers: game.fired.offers.map((cid) => {
            const club = session.cache.get("clubs", cid);
            return { cid, name: club?.name ?? "?", leagueId: club?.leagueId ?? "" };
          }),
        }
      : null,
  };
}

/** Contract talks with one of the user's players: his mood and what he asks per length. */
export function contractTalks(session: LeagueSession, pid: number): ContractTalks {
  const game = meta<GameMeta>(session, "game");
  const world = loopWorld(session, game.season);
  const p = session.cache.get("players", pid);
  const club = world.clubs.find((c) => c.cid === p?.cid);
  if (!p || !club) throw new Error(`No player ${pid} at a club`);
  const league = world.clubs.filter((c) => c.leagueId === club.leagueId);
  const level =
    league.reduce((s, c) => s + clubStrength(world.players, c.cid, game.date), 0) /
    Math.max(1, league.length);
  const mood = moodAtClub(world, p, game.date);
  const left = yearsLeft(p, game.date);
  return {
    pid,
    name: `${p.firstName} ${p.lastName}`.trim(),
    position: p.position,
    age: Math.floor(exactAge(p.birthDate, game.date)),
    ovr: p.ovr,
    pot: p.pot,
    wage: p.contract?.wage ?? 0,
    expires: p.contract?.expires ?? null,
    yearsLeft: left,
    value: marketValue(p, game.date, level),
    mood: mood ?? { value: 0, components: {}, willing: false },
    asks: contractAsks(p, game.date, clubRevenue(world, club), mood?.value ?? 0, left === 1).map(
      (a) => ({ ...a, expires: contractEnd(game.season, a.years, game.date) }),
    ),
    windowOpen: openWindow(game.date, game.season) !== null,
    userPlayer: p.cid === game.userCid,
  };
}

/** Renews one of the user's players at his ask for `years` (only in a window, SPEC §7.6). */
export async function renewContract(session: LeagueSession, pid: number, years: number) {
  const game = meta<GameMeta>(session, "game");
  const talks = contractTalks(session, pid);
  if (!talks.userPlayer) throw new Error("You can only renew your own players");
  if (!talks.windowOpen) throw new Error("Contracts can only be renewed in a transfer window");
  if (!talks.mood.willing) throw new Error(`${talks.name} won't negotiate with your club`);
  const ask = talks.asks.find((a) => a.years === years);
  const p = session.cache.get("players", pid);
  if (!ask || !p) throw new Error(`No ask for ${years} years`);
  const expires = contractEnd(game.season, years, game.date);
  if (expires <= (p.contract?.expires ?? "")) {
    throw new Error(`A renewal must run past ${p.contract?.expires ?? "the current contract"}`);
  }
  signContract(p, ask.wage, expires, game.date);
  session.cache.put("players", p);
  saveTransactions(session, [
    {
      season: game.season,
      date: game.date,
      type: "renewal",
      pids: [pid],
      cids: [game.userCid],
      names: [talks.name, session.cache.get("clubs", game.userCid)?.name ?? ""],
      fee: 0,
    },
  ]);
  await session.cache.flush();
}

/** The sacked user takes one of his job offers: the game goes on at that club. */
export async function acceptJobOffer(session: LeagueSession, cid: number): Promise<void> {
  const game = { ...meta<GameMeta>(session, "game") };
  if (!game.fired?.offers.includes(cid)) throw new Error(`No job offer from club ${cid}`);
  const club = session.cache.get("clubs", cid);
  game.userCid = cid;
  game.fired = null;
  session.cache.put("meta", game, "game");
  const row = session.cache.get("clubSeasons", [cid, game.season]);
  if (row) {
    session.cache.put("clubSeasons", {
      ...row,
      boardStart: BOARD.fresh,
      boardConfidence: BOARD.fresh,
      boardWarned: false,
      boardSacked: false,
    });
  }
  saveMessages(session, [
    {
      date: game.date,
      season: game.season,
      kind: "board",
      subject: `Welcome to ${club?.name ?? "your new club"}`,
      body: "You have taken the job. The board gives you a fresh start.",
      read: false,
    },
  ]);
  await session.cache.flush();
  await updateLeagueSummary(session.lid, { clubName: club?.name ?? "" });
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

/** End of the season's matches: final tables and the season's awards (SPEC §10.5). */
function finishSeason(session: LeagueSession, state: SeasonState): void {
  const outcome = seasonOutcome(state);
  const lines = session.cache
    .getAll("playerStats")
    .filter((r) => r.season === state.season)
    .map((r) => ({
      pid: r.pid,
      cid: r.cid,
      competition: r.competition,
      appearances: r.appearances,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      ratingTotal: r.ratingTotal,
    }));
  const awards = seasonAwards(
    state,
    outcome,
    session.cache.getAll("clubs"),
    session.cache.getAll("players"),
    lines,
  );
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const award of awards) session.cache.put("awards", { aid: ids.aid++, ...award });
  session.cache.put("meta", ids, "ids");
}

/**
 * Processes days after the game date (src/worker/season/runner.ts) until `stop` says
 * so, `limit` is reached or the season's matches are over, and saves the results.
 */
function processDays(
  session: LeagueSession,
  limit: string | null,
  stop: (day: string, fixtures: Fixture[]) => boolean,
): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const stored = meta<SeasonMeta>(session, "season");
  const world = loopWorld(session, game.season);
  const from = game.date;
  const days = runDays(world, state, from, { limit, stop, stopWhenUserSacked: true });

  saveBooks(session, world);
  for (const { fixture, result } of days.played) recordMatch(session, fixture, result);
  for (const fixture of days.created) session.cache.put("fixtures", fixture);
  for (const p of world.players) if (days.changed.has(p.pid)) session.cache.put("players", p);
  if (days.played.length > 0 && game.phase === "preseason") game.phase = "regularSeason";
  game.date = days.date;
  if (days.ended && game.phase !== "endOfSeason") {
    game.phase = "endOfSeason";
    finishSeason(session, state);
  }
  if (days.userSacked) {
    game.fired = {
      date: days.userSacked,
      offers: jobOffers(world.clubs, world.clubSeasons, game.userCid, game.seed, days.userSacked),
    };
    days.messages.push({
      date: days.userSacked,
      season: game.season,
      kind: "board",
      subject: "You have been sacked",
      body: `Board confidence fell too low. ${game.fired.offers.length} club(s) have offered you a job.`,
      read: false,
    });
  }
  saveBooks(session, world);
  saveMessages(session, days.messages);
  saveTransactions(session, days.transactions);
  saveSeason(session, state, stored.movesApplied);
  session.cache.put("meta", game, "game");
  return {
    from,
    to: game.date,
    matchesPlayed: days.played.length,
    events: days.events,
    phase: game.phase,
  };
}

/** 1 June: promotion and relegation (SPEC §3.1). */
function proceedToPromotionRelegation(session: LeagueSession): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const outcome = seasonOutcome(state);
  const from = game.date;
  const processing = seasonDate(
    game.season,
    competitionsConfig.keyDates.endOfSeasonProcessing ?? "06-01",
  );
  if (processing > game.date) game.date = processing;
  // Month-end money up to 1 June, in the clubs' leagues of this season.
  const books = loopWorld(session, game.season);
  settleMonths(books, from, game.date);
  saveBooks(session, books);
  const clubs = session.cache.getAll("clubs").map((c) => ({ ...c }));
  applyMoves(clubs, outcome.moves);
  for (const club of clubs) session.cache.put("clubs", club);
  // Retirements and departures (SPEC §5.5).
  const world = loopWorld(session, game.season);
  const turnover = endOfSeasonTurnover(world, game.season, game.date);
  for (const p of world.players) if (turnover.changed.has(p.pid)) session.cache.put("players", p);
  saveTransactions(session, turnover.transactions);
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

/** Peak OVR below this, no award and no notable spell at the user's club: pruned (SPEC §12). */
const PRUNE = { afterSeasons: 3, peakOvrBelow: 74, userClubAppearances: 50 };

/**
 * Deletes long-retired players nobody will look up, with their stat rows (SPEC §12):
 * retired at least 3 seasons ago, peak OVR under 74, no award, fewer than 50
 * appearances for the user's club. Transactions and awards keep their name snapshots.
 */
export async function pruneRetiredPlayers(session: LeagueSession, season: number): Promise<number> {
  const { cache, db } = session;
  const userCid = meta<GameMeta>(session, "game").userCid;
  const candidates = cache
    .getAll("players")
    .filter(
      (p) =>
        p.status === "retired" &&
        p.retiredSeason !== null &&
        p.retiredSeason <= season - PRUNE.afterSeasons &&
        Math.max(...p.ratingsHistory.map((r) => r.ovr)) < PRUNE.peakOvrBelow,
    );
  if (candidates.length === 0) return 0;
  const awarded = new Set((await db.getAll("awards")).map((a) => a.pid));
  const pruned: number[] = [];
  for (const p of candidates) {
    if (awarded.has(p.pid)) continue;
    const stats = await db.getAllFromIndex("playerStats", "pid", p.pid);
    const forUser = stats.filter((r) => r.cid === userCid).reduce((n, r) => n + r.appearances, 0);
    if (forUser >= PRUNE.userClubAppearances) continue;
    pruned.push(p.pid);
  }
  for (const pid of pruned) cache.delete("players", pid);
  await cache.flush();
  const tx = db.transaction("playerStats", "readwrite");
  for (const pid of pruned) {
    let cursor = await tx.store.index("pid").openCursor(pid);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  return pruned.length;
}

/** 1 July: a new season starts (SPEC §3.1). */
async function advanceToPreseason(session: LeagueSession): Promise<PlayReport> {
  const { cache, db } = session;
  const game = { ...meta<GameMeta>(session, "game") };
  const from = game.date;
  const old = game.season;
  const season = old + 1;

  // 1 July: summer development for the season just played, then youth intake, academy
  // decisions and the squad top-up (src/worker/season/offseason.ts).
  const world = loopWorld(session, old);
  // 30 June: the season's last month-ends and its cash snapshot.
  closeSeasonBooks(world, old, from);
  saveBooks(session, world);
  const turnover = summerTransition(world, loadSeason(session));
  for (const p of world.players) if (turnover.changed.has(p.pid)) cache.put("players", p);
  for (const p of turnover.added) cache.put("players", p);
  saveTransactions(session, turnover.transactions);
  saveMessages(session, turnover.messages);

  // The new season's club rows (budget base, ticket prices).
  const next = openSeasonBooks(world.clubs, world.clubSeasons, season, game.userCid);
  for (const row of next.values()) cache.put("clubSeasons", row);
  for (const club of world.clubs) cache.put("clubs", club);
  game.season = season;
  game.phase = "preseason";
  game.date = `${season}-07-01`;
  cache.put("meta", game, "game");
  cache.delete("meta", "season");
  ensureSeason(session);

  // Last season's rows stay in IndexedDB; drop them from memory once saved.
  await cache.flush();
  cache.evict("fixtures", (f) => f.season < season);
  cache.evict("matches", (m) => m.season < season);
  cache.evict("playerStats", (r) => r.season < season);
  cache.evict("awards", (r) => r.season < season);
  cache.evict("transactions", (r) => r.season < season);

  await pruneMatchRecords(db, season, game.userCid);
  await pruneRetiredPlayers(session, season);
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
      report = processDays(session, null, (_day, fixtures) =>
        fixtures.some((f) => f.homeCid === userCid || f.awayCid === userCid),
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
