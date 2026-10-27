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
import { withPlayerReferences } from "./messages";
import { addDays } from "../../common/dates";
import { GameError, LEAGUE_CLOSED } from "../../common/errors";
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { WorldConfig } from "../../common/config/worlds";
import {
  PLAYER_STAT_TOTALS,
  type ClubSeason,
  type Fixture,
  type GameMeta,
  type IdCounters,
  type Phase,
  type PlayerStatsRow,
  type SeasonMeta,
} from "../../common/schema";
import type { MatchResult } from "../../common/match";
import type { GameState, PlayOption, PlayReport } from "../../common/api";
import { updateLeagueSummary } from "../db/globalDb";
import { applyCapGrace } from "../finance/softCap";
import { runDraft } from "../season/draft";
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
import { withAutoLineup } from "../club/tactics";
import type { NewOffer } from "../market/aiMarket";
import { runDays, type DaysOptions, type NewMessage } from "../season/runner";
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

export const meta = <T>(session: LeagueSession, key: string): T => {
  const row = session.cache.get("meta", key) as T | undefined;
  if (row === undefined) throw new Error(`Save has no meta row "${key}"`);
  return row;
};

/** The fixture the user is watching live, if a live match is under way (M6). */
export function liveFixture(session: LeagueSession): number | null {
  const row = session.cache.get("meta", "live") as { fid: number } | undefined;
  return row?.fid ?? null;
}

/** The user's other actions wait while his live match is under way. */
export function assertNotLive(session: LeagueSession): void {
  if (liveFixture(session) !== null) throw new GameError("Finish your live match first.");
}

/** The window open on `date` (opening day included, the day after deadline day not). */
export function openWindow(date: string, season: number, config: CompetitionsConfig) {
  for (const w of config.windows) {
    const opens = seasonDate(season, w.opens);
    const closes = seasonDate(season, w.closes);
    if (date >= opens && date < closes) return { id: w.id, closes };
  }
  return null;
}

/** The save's clubs and players as the in-memory season code works on them (cache objects). */
export function loopWorld(session: LeagueSession, season: number): LoopWorld {
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
    config: session.config,
    clubs: session.cache.getAll("clubs"),
    players: session.cache.getAll("players"),
    reputation,
    clubSeasons,
    userCid: game.userCid,
    seed: game.seed,
    openBids: session.cache
      .getAll("offers")
      .filter((o) => o.status === "open" && o.toCid === game.userCid)
      .map((o) => ({ pid: o.pid, fromCid: o.fromCid, expires: o.expires })),
    nextPid: () => {
      const pid = ids.pid++;
      session.cache.put("meta", { ...meta<IdCounters>(session, "ids"), pid: ids.pid }, "ids");
      return pid;
    },
  };
}

/** Saves the clubs and club-season rows the season code changed in place (cash, books). */
export function saveBooks(session: LeagueSession, world: LoopWorld): void {
  for (const club of world.clubs) session.cache.put("clubs", club);
  for (const row of world.clubSeasons.values()) session.cache.put("clubSeasons", row);
}

export function saveTransactions(session: LeagueSession, rows: readonly NewTransaction[]): void {
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const row of rows) session.cache.put("transactions", { xid: ids.xid++, ...row });
  session.cache.put("meta", ids, "ids");
}

export function loadSeason(session: LeagueSession): SeasonState {
  const game = meta<GameMeta>(session, "game");
  const stored = meta<SeasonMeta>(session, "season");
  const ids = meta<IdCounters>(session, "ids");
  const fixtures = session.cache.getAll("fixtures").filter((f) => f.season === stored.season);
  return restoreSeason(stored, game.seed, fixtures, ids.fid, session.config.competitions);
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
    config: session.config.competitions,
  });
  for (const f of state.fixtures) session.cache.put("fixtures", f);
  saveSeason(session, state, false);
  // The board's targets for the season (SPEC §6.5).
  const world = loopWorld(session, game.season);
  const message = preseasonBoard(world, game.season, game.date, session.config.competitions);
  saveBooks(session, world);
  if (message) saveMessages(session, [message]);
}

export function saveMessages(session: LeagueSession, rows: readonly NewMessage[]): void {
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const row of withPlayerReferences(rows, session.cache.getAll("players")))
    session.cache.put("inbox", { mid: ids.mid++, ...row });
  session.cache.put("meta", ids, "ids");
}

export function gameState(session: LeagueSession): GameState {
  const game = meta<GameMeta>(session, "game");
  const stored = meta<SeasonMeta>(session, "season");
  const window = openWindow(game.date, game.season, session.config.competitions);
  const options: PlayOption[] = [];
  const live = liveFixture(session);
  const next = session.cache
    .getAll("fixtures")
    .filter(
      (f) =>
        f.season === game.season &&
        !f.result &&
        (f.homeCid === game.userCid || f.awayCid === game.userCid),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid))[0];
  if (game.fired || live !== null) {
    // Sacked: nothing to play until the user takes a job (acceptJobOffer). Watching: the
    // live match comes first.
  } else if (game.phase === "endOfSeason" && !stored.movesApplied) {
    options.push("proceedToPromotionRelegation");
  } else if (game.phase === "endOfSeason" || offseasonPhase(game.phase)) {
    options.push(nextOffseasonStage(session.config, game.phase)?.option ?? "advanceToPreseason");
  } else {
    options.push("untilNextMatch");
    if (next) options.push("watchNextMatch");
    options.push("oneWeek");
    if (window) options.push("untilWindowCloses");
    options.push("untilEndOfSeason");
  }
  return {
    season: game.season,
    phase: game.phase,
    date: game.date,
    window,
    options,
    nextUserFixture: next ?? null,
    live: live === null ? null : { fid: live },
    playing: running.get(session) ?? null,
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

/** Settings: renames the save, in the save and in the list of saves. */
export async function renameLeague(session: LeagueSession, name: string): Promise<void> {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > 60)
    throw new GameError("A league name has 1 to 60 characters.");
  session.cache.put("meta", { ...meta<GameMeta>(session, "game"), name: clean }, "game");
  await session.cache.flush();
  await updateLeagueSummary(session.lid, { name: clean });
}

/** The sacked user takes one of his job offers: the game goes on at that club. */
export async function acceptJobOffer(session: LeagueSession, cid: number): Promise<void> {
  const game = { ...meta<GameMeta>(session, "game") };
  if (!game.fired?.offers.includes(cid)) throw new GameError("That job offer is no longer open.");
  const club = session.cache.get("clubs", cid);
  game.userCid = cid;
  game.fired = null;
  session.cache.put("meta", game, "game");
  // His tactic there starts as the AI's pick, as at a new league.
  if (club) {
    const players = session.cache.getAll("players");
    session.cache.put(
      "clubs",
      withAutoLineup(club, players, game.date, session.config.competitions),
    );
  }
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
    motm: 0,
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
    if (result.motm === p.pid) row.motm++;
    row.ratingTotal += p.rating;
    for (const stat of PLAYER_STAT_TOTALS) row[stat] += p[stat];
    cache.put("playerStats", row);
  }
}

/** End of the season's matches: final tables and the season's awards (SPEC §10.5). */
function finishSeason(session: LeagueSession, state: SeasonState): void {
  const outcome = seasonOutcome(state, session.config.competitions);
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
    session.config.competitions,
  );
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const award of awards) session.cache.put("awards", { aid: ids.aid++, ...award });
  session.cache.put("meta", ids, "ids");
}

/**
 * Processes days after the game date (src/worker/season/runner.ts) until `stop` says
 * so, `limit` is reached or the season's matches are over, and saves the results.
 */
export function processDays(
  session: LeagueSession,
  limit: string | null,
  stop: (day: string, fixtures: Fixture[]) => boolean,
  watch: Pick<DaysOptions, "hold" | "resume"> = {},
): PlayReport & { held: boolean } {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const stored = meta<SeasonMeta>(session, "season");
  const world = loopWorld(session, game.season);
  const from = game.date;
  const days = runDays(world, state, from, { limit, stop, stopWhenUserSacked: true, ...watch });

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
  saveOffers(session, days.offers);
  // Players the AI signed: bids for them elsewhere no longer stand.
  const moved = new Set(
    days.transactions
      .filter((t) => t.type === "transfer" || t.type === "freeAgent")
      .flatMap((t) => t.pids),
  );
  for (const offer of session.cache.getAll("offers")) {
    if (moved.has(offer.pid) && (offer.status === "open" || offer.status === "accepted")) {
      session.cache.put("offers", { ...offer, status: "expired" });
    }
  }
  expireOffers(session, game.date);
  saveSeason(session, state, stored.movesApplied);
  session.cache.put("meta", game, "game");
  return {
    from,
    to: game.date,
    matchesPlayed: days.played.length,
    events: days.events,
    phase: game.phase,
    held: days.held,
  };
}

function saveOffers(session: LeagueSession, rows: readonly NewOffer[]): void {
  const ids = { ...meta<IdCounters>(session, "ids") };
  for (const row of rows) session.cache.put("offers", { oid: ids.oid++, ...row });
  session.cache.put("meta", ids, "ids");
}

/** Bids still standing when their window closed lapse (deadline day processed). */
function expireOffers(session: LeagueSession, date: string): void {
  for (const offer of session.cache.getAll("offers")) {
    if ((offer.status === "open" || offer.status === "accepted") && date >= offer.expires) {
      session.cache.put("offers", { ...offer, status: "expired" });
    }
  }
}

/** 1 June: promotion and relegation (SPEC §3.1). */
/** An off-season stage after promotion and relegation: its phase, Play option and date. */
interface OffseasonStage {
  phase: Phase;
  option: PlayOption;
  /** MM-DD key date (config) the stage starts on. */
  date: string;
}

const offseasonPhase = (phase: Phase) =>
  phase === "draftLottery" || phase === "draft" || phase === "resigning";

/**
 * The world's off-season stages, in order (SPEC §17.2): with a draft, its lottery and the
 * draft; with a re-signing period, that period. None in Classic.
 */
function offseasonStages(config: WorldConfig): OffseasonStage[] {
  const dates = config.competitions.keyDates;
  const stage = (phase: Phase, option: PlayOption, key: string): OffseasonStage => {
    const date = dates[key];
    if (!date) throw new Error(`The ${config.name} world has no ${key} date`);
    return { phase, option, date };
  };
  return [
    ...(config.switches.youth === "draft"
      ? [
          stage("draftLottery", "untilDraftLottery", "draftLottery"),
          stage("draft", "untilDraft", "draft"),
        ]
      : []),
    ...(config.switches.renewals === "resigningPeriod"
      ? [stage("resigning", "untilResigning", "resigningOpens")]
      : []),
  ];
}

/** The stage after `phase` (from the end of the season), or null when preseason is next. */
function nextOffseasonStage(config: WorldConfig, phase: Phase): OffseasonStage | null {
  const stages = offseasonStages(config);
  const at = stages.findIndex((s) => s.phase === phase);
  return stages[at + 1] ?? null;
}

/**
 * Moves to the next off-season stage. The draft is held on reaching it (its AI core: the
 * AI picks for every club, the user's too, until SL4); the lottery (SL4) and the
 * re-signing period (SL5) only set the date and phase for now.
 */
function toOffseasonStage(session: LeagueSession, option: PlayOption): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const stage = offseasonStages(session.config).find((s) => s.option === option);
  if (!stage) throw new Error(`No off-season stage for ${option}`);
  const from = game.date;
  game.date = seasonDate(game.season, stage.date);
  game.phase = stage.phase;
  if (stage.phase === "draft") {
    const world = loopWorld(session, game.season);
    const outcome = seasonOutcome(loadSeason(session), session.config.competitions);
    const drafted = runDraft(world, outcome, game.season, game.date);
    for (const p of drafted.added) session.cache.put("players", p);
    saveTransactions(session, drafted.transactions);
  }
  session.cache.put("meta", game, "game");
  return { from, to: game.date, matchesPlayed: 0, events: [], phase: game.phase };
}

function proceedToPromotionRelegation(session: LeagueSession): PlayReport {
  const game = { ...meta<GameMeta>(session, "game") };
  const state = loadSeason(session);
  const outcome = seasonOutcome(state, session.config.competitions);
  const from = game.date;
  const processing = seasonDate(
    game.season,
    session.config.competitions.keyDates.endOfSeasonProcessing ?? "06-01",
  );
  if (processing > game.date) game.date = processing;
  // Month-end money up to 1 June, in the clubs' leagues of this season.
  const books = loopWorld(session, game.season);
  const amortised = settleMonths(books, from, game.date, session.config.competitions);
  for (const p of books.players) if (amortised.has(p.pid)) session.cache.put("players", p);
  saveBooks(session, books);
  const clubs = session.cache.getAll("clubs").map((c) => ({ ...c }));
  applyMoves(clubs, outcome.moves);
  applyCapGrace(clubs, outcome.moves, session.config.competitions, game.season);
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

/** Names of pruned players (meta row "pruned"), for old box scores and links to them. */
export type PrunedNames = Record<number, { name: string; retired: number | null }>;

/** A player's name, also after he was pruned; null if never known. */
export function prunedName(session: LeagueSession, pid: number): PrunedNames[number] | null {
  return (session.cache.get("meta", "pruned") as PrunedNames | undefined)?.[pid] ?? null;
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
  // Stat rows first: if the page closes in between, the players are still there and are
  // pruned at the next rollover, rather than leaving stat rows without a player.
  const tx = db.transaction("playerStats", "readwrite");
  for (const pid of pruned) {
    let cursor = await tx.store.index("pid").openCursor(pid);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  // Their names stay (old box scores of the user's matches list them; SPEC §12).
  const names = { ...((cache.get("meta", "pruned") as PrunedNames | undefined) ?? {}) };
  for (const pid of pruned) {
    const p = cache.get("players", pid);
    if (p) names[pid] = { name: `${p.firstName} ${p.lastName}`.trim(), retired: p.retiredSeason };
    cache.delete("players", pid);
  }
  cache.put("meta", names, "pruned");
  await cache.flush();
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
  // 30 June: the season's last month-ends, its cash snapshot and the FFP check.
  const ffp = closeSeasonBooks(world, old, from, game.userCid, world.config.competitions);
  for (const p of world.players) if (ffp.changed.has(p.pid)) cache.put("players", p);
  saveMessages(session, ffp.messages);
  saveBooks(session, world);
  const turnover = summerTransition(world, loadSeason(session));
  for (const p of world.players) if (turnover.changed.has(p.pid)) cache.put("players", p);
  for (const p of turnover.added) cache.put("players", p);
  saveTransactions(session, turnover.transactions);
  saveMessages(session, turnover.messages);

  // The new season's club rows (budget base, ticket prices).
  const next = openSeasonBooks(
    world.clubs,
    world.clubSeasons,
    season,
    game.userCid,
    world.config.competitions,
  );
  for (const row of next.values()) cache.put("clubSeasons", row);
  for (const club of world.clubs) cache.put("clubs", club);
  game.season = season;
  game.phase = "preseason";
  game.date = `${season}-07-01`;
  cache.put("meta", game, "game");
  cache.delete("meta", "season");
  ensureSeason(session);
  // Bids are kept for their season only.
  for (const offer of cache.getAll("offers")) {
    if ((offer.season ?? 0) < season) cache.delete("offers", offer.oid);
  }

  // The new season is saved in one go (a page closed mid-rollover finds the old season or
  // the new one, never half of each). Last season's rows stay in IndexedDB; drop them from
  // memory once saved. Pruning follows; what a closed page misses, the next rollover does.
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

/**
 * Actions on a save (Play, and the user's market actions) run one at a time, even when two
 * tabs act together.
 */
const queues = new WeakMap<LeagueSession, Promise<unknown>>();

export function queued<T>(session: LeagueSession, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(session) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => {
      if (session.closed) throw new GameError(LEAGUE_CLOSED);
      return task();
    });
  queues.set(session, run);
  return run;
}

/** Resolves once no action is queued or running for the save. */
export async function whenIdle(session: LeagueSession): Promise<void> {
  for (;;) {
    const last = queues.get(session);
    if (!last) return;
    await last.catch(() => undefined);
    if (queues.get(session) === last) return;
  }
}

/** The Play action under way in each save: every tab shows "Playing…" and waits. */
const running = new WeakMap<LeagueSession, PlayOption>();

/**
 * Runs a Play action in the save's queue, marked as under way while it runs. `onStart` is
 * called once it starts (the worker tells every tab).
 */
export function playing<T>(
  session: LeagueSession,
  option: PlayOption,
  task: () => Promise<T>,
  onStart?: () => void,
): Promise<T> {
  return queued(session, async () => {
    running.set(session, option);
    onStart?.();
    try {
      return await task();
    } finally {
      running.delete(session);
    }
  });
}

/** Runs one Play-menu action and saves the result. */
export function play(
  session: LeagueSession,
  option: PlayOption,
  onStart?: () => void,
): Promise<PlayReport> {
  return playing(session, option, () => runPlay(session, option), onStart);
}

async function runPlay(session: LeagueSession, option: PlayOption): Promise<PlayReport> {
  ensureSeason(session);
  assertNotLive(session);
  const state = gameState(session);
  if (!state.options.includes(option)) {
    throw new GameError(
      "That isn't possible now: the game has moved on, maybe in another tab. Pick again from the Play menu.",
    );
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
    case "untilDraftLottery":
    case "untilDraft":
    case "untilResigning":
      report = toOffseasonStage(session, option);
      break;
    case "advanceToPreseason":
      report = await advanceToPreseason(session);
      break;
    case "watchNextMatch":
      throw new Error("Watching a match starts in league/live.ts");
  }
  await session.cache.flush();
  const game = meta<GameMeta>(session, "game");
  await updateLeagueSummary(session.lid, {
    season: game.season,
    lastPlayedAt: new Date().toISOString(),
  });
  return report;
}
