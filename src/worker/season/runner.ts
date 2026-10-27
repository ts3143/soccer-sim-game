/**
 * The day-by-day season loop, in memory (SPEC §3.2): the save (src/worker/league/game.ts)
 * persists what it returns, and the headless tools call it directly, so both run the
 * same code.
 *
 * Each processed day: training injuries and month-end money for the days since the last
 * one, then the day's dated events (the winter development update on 1 January), the AI's
 * market on market days (src/worker/market/aiMarket.ts; without windows, free agency's
 * market days, src/worker/season/freeAgency.ts), then its matches (gate receipts and prize
 * money; where the squad limit counts from the first league match, AI clubs over it trim
 * first). When the matches end, TV merit money is paid.
 * A day is processed when it has a match or an event; the game date is the last day
 * processed. A match the user watches splits its day (M6): `hold` stops before the day's
 * matches, `resume` plays them with the watched result and finishes the day.
 */
import type { SeasonEvent } from "../../common/api";
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { MatchResult } from "../../common/match";
import { addDays } from "../../common/dates";
import type { ClubSeason, Fixture, InboxMessage, TransactionRow } from "../../common/schema";
import { marketDay, marketDays, type NewOffer } from "../market/aiMarket";
import { returnLoans } from "../market/loans";
import { aiRenewals, contractWarning } from "../market/renewals";
import { seasonDate } from "../schedule/calendar";
import { academyReminder, developmentUpdate, type LoopWorld } from "./offseason";
import { matchdayIncome, meritIncome, prizeIncome, settleMonths } from "../finance/finance";
import { boardSacks, metInPlayoff, targetPosition, updateConfidence } from "../club/board";
import { seasonEndStanding, updateHype } from "../club/standing";
import {
  leagueTableOf,
  nextMatchDate,
  playDate,
  type PlayFixture,
  seasonOutcome,
  type SeasonState,
} from "./season";
import { squadPlay } from "./squads";
import {
  firstLeagueDay,
  freeAgencyDay,
  freeAgencyDays,
  rosterDeadline,
  trimSquads,
} from "./freeAgency";

/** Dated events of a season (SPEC §3.1) besides matches: windows and the winter update. */
/** `academies`: whether the world's clubs have academies (the user's 1 May reminder). */
export function seasonEvents(
  season: number,
  config: CompetitionsConfig,
  academies: boolean,
): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  for (const w of config.windows) {
    events.push({ date: seasonDate(season, w.opens), kind: "windowOpens", window: w.id });
    events.push({ date: seasonDate(season, w.closes), kind: "windowCloses", window: w.id });
  }
  const winter = config.keyDates.winterDevelopmentUpdate;
  if (winter) events.push({ date: seasonDate(season, winter), kind: "winterUpdate" });
  // The renewal deadline (SPEC §3.1): a reminder the day before winter deadline day.
  const january = config.windows.find((w) => w.id === "winter");
  if (january) {
    events.push({
      date: addDays(seasonDate(season, january.deadlineDay), -1),
      kind: "deadlineReminder",
      window: january.id,
    });
  }
  // The user's academy decisions are due by 1 July (SPEC §7.2): a reminder on 1 May.
  if (academies) events.push({ date: seasonDate(season, "05-01"), kind: "academyReminder" });
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface PlayedMatch {
  fixture: Fixture;
  result: MatchResult;
}

export interface DaysResult {
  /** The new game date: the last day processed, or `limit` if it was reached. */
  date: string;
  played: PlayedMatch[];
  /** Fixtures created on the way (cup draws, play-off stages). */
  created: Fixture[];
  events: SeasonEvent[];
  /** Players whose rows changed (condition, injuries, development). */
  changed: Set<number>;
  /** True once the season has no matches left. */
  ended: boolean;
  /** True when the run stopped on `hold`'s day before its matches (a match to watch). */
  held: boolean;
  /** Injury lengths (days) in matches and training, and how many were in training. */
  injuries: number[];
  trainingInjuries: number;
  /** Every club whose board would sack its manager (the harness counts them all). */
  sackings: { cid: number; date: string; seasonEnd: boolean }[];
  /** The date the board sacked the user, if it did. */
  userSacked: string | null;
  /** Messages for the user's inbox. */
  messages: NewMessage[];
  /** Transactions on the way (renewals, transfers, signings). */
  transactions: Omit<TransactionRow, "xid">[];
  /** New AI bids for the user's players (to save; he answers them in his inbox). */
  offers: NewOffer[];
}

export type NewMessage = Omit<InboxMessage, "mid">;

export interface DaysOptions {
  /** Process days up to and including this date (null: no limit). */
  limit: string | null;
  /** Stop after a day when this returns true. */
  stop?: (day: string, played: Fixture[]) => boolean;
  /** Called after each processed day (headless metrics). */
  onDay?: (day: string) => void;
  /** Stop processing when the board sacks the user (the save does; the harness doesn't). */
  stopWhenUserSacked?: boolean;
  /**
   * Watching a match (M6): on the first day this returns true for (checked after the
   * day's events, market and training, so a cup tie drawn on the way counts), stop
   * before the day's matches. The game date becomes that day, its matches still to play.
   */
  hold?: (day: string, fixtures: readonly Fixture[]) => boolean;
  /**
   * The rest of a held day: its matches (results given for the watched ones, the others
   * simulated) and everything after them, without its events, market or training again.
   */
  resume?: { date: string; results: ReadonlyMap<number, MatchResult> };
}

/** Processes days after `from` until the limit, the stop condition or the season's end. */
export function runDays(
  world: LoopWorld,
  state: SeasonState,
  from: string,
  options: DaysOptions,
): DaysResult {
  const config = world.config.competitions;
  const squads = squadPlay(state, world.clubs, world.players, world.userCid, config);
  const events = seasonEvents(state.season, config, world.config.switches.youth === "academy");
  const out: DaysResult = {
    date: from,
    played: [],
    created: [],
    events: [],
    changed: new Set(),
    ended: false,
    held: false,
    injuries: [],
    trainingInjuries: 0,
    sackings: [],
    userSacked: null,
    messages: [],
    transactions: [],
    offers: [],
  };
  const market = marketDays(state.season, config);
  const freeAgency = freeAgencyDays(state.season, config, rosterDeadline(config, state.fixtures));
  const limitFrom = config.rosterRules.maxSeniorFromFirstMatch
    ? firstLeagueDay(config, state.fixtures)
    : null;
  const warn = (row: ClubSeason, day: string) => {
    if (row.cid !== world.userCid || (row.boardConfidence ?? 100) >= 40 || row.boardWarned) return;
    row.boardWarned = true;
    out.messages.push({
      date: day,
      season: state.season,
      kind: "board",
      subject: "The board is concerned",
      body: `Board confidence has fallen to ${Math.round(row.boardConfidence ?? 0)}. Results must improve.`,
      read: false,
    });
  };
  /** League rows, board confidence and would-be sackings after a matchday. */
  const afterMatchday = (day: string, seasonOver: boolean) => {
    for (const leagueId of Object.keys(state.leagueClubs)) {
      const table = leagueTableOf(state, leagueId, config);
      // At the season's end, a club that met its target in the play-off counts as having
      // finished where the target asked (the board judges the table otherwise).
      const league = config.leagues.find((l) => l.id === leagueId);
      const judged = (t: (typeof table)[0]) => {
        const row = world.clubSeasons.get(t.cid);
        if (!seasonOver || !league || !row) return table;
        if (!metInPlayoff(league, row.boardExpectation, t.cid, state.fixtures)) return table;
        const target = targetPosition(leagueId, row.boardExpectation, config);
        return table.map((r) =>
          r.cid === t.cid ? { ...r, position: Math.min(r.position, target) } : r,
        );
      };
      const games = 2 * ((state.leagueClubs[leagueId]?.length ?? 2) - 1);
      for (const t of table) {
        const row = world.clubSeasons.get(t.cid);
        const club = world.clubs.find((c) => c.cid === t.cid);
        if (!row || !club) continue;
        Object.assign(row, {
          leagueId,
          won: t.won,
          drawn: t.drawn,
          lost: t.lost,
          goalsFor: t.goalsFor,
          goalsAgainst: t.goalsAgainst,
          points: t.points,
          finish: seasonOver ? t.position : null,
        });
        const confidence = updateConfidence(row, club, judged(t), t.played / games, config);
        warn(row, day);
        if (!row.boardSacked && boardSacks(confidence, t.played / games, seasonOver)) {
          row.boardSacked = true;
          out.sackings.push({ cid: t.cid, date: day, seasonEnd: seasonOver });
          if (t.cid === world.userCid) out.userSacked = day;
        }
      }
    }
  };
  const results = new Map<number, MatchResult>();
  const play: PlayFixture = (fixture, setup) => {
    const watched = options.resume?.results.get(fixture.fid);
    // A watched match was played live; picking its squads again (unused) leaves the
    // day's caches (strength before kick-off, for hype) as a simulated match would.
    if (watched) squads.prepare(fixture);
    const result = watched ? squads.finish(fixture, watched) : squads.play(fixture, setup);
    results.set(fixture.fid, result);
    return result;
  };

  for (;;) {
    const nextMatch = nextMatchDate(state);
    if (nextMatch === null) break;
    const nextEvent = events.find((e) => e.date > out.date)?.date ?? null;
    const nextMarket = market.find((m) => m.date > out.date)?.date ?? null;
    const nextFreeAgency = freeAgency.find((m) => m.date > out.date)?.date ?? null;
    const day = [nextEvent, nextMarket, nextFreeAgency].reduce<string>(
      (d, x) => (x !== null && x < d ? x : d),
      nextMatch,
    );
    if (options.limit !== null && day > options.limit) break;

    // A held day resumes at its matches: its events, market and training already ran.
    const resuming = options.resume?.date === day && out.date === day;
    if (!resuming) {
      squads.train(out.date, day);
      for (const pid of settleMonths(world, out.date, day, config)) out.changed.add(pid);
      for (const event of events.filter((e) => e.date === day)) {
        out.events.push(event);
        if (event.kind === "winterUpdate") {
          for (const pid of developmentUpdate(world, state, day, false)) out.changed.add(pid);
        }
        if (event.kind === "windowOpens" && event.window === "winter") {
          // Last chance for final-year players (SPEC §3.1): the AI renews; the user is told.
          const renewed = aiRenewals(world, state.season, day, "winter");
          for (const pid of renewed.changed) out.changed.add(pid);
          out.transactions.push(...renewed.transactions);
          const warning = contractWarning(world, state.season, day, false);
          if (warning) out.messages.push(warning);
        }
        if (event.kind === "deadlineReminder") {
          const reminder = contractWarning(world, state.season, day, true);
          if (reminder) out.messages.push(reminder);
        }
        if (event.kind === "academyReminder") {
          const reminder = academyReminder(world, state.season, day);
          if (reminder) out.messages.push(reminder);
        }
      }
      // Half-season loans end on 1 January, after that day's development update.
      if (world.players.some((p) => p.status === "loan" && p.loan && p.loan.until <= day)) {
        const back = returnLoans(world, day, state.season);
        for (const pid of back.changed) out.changed.add(pid);
        out.messages.push(...back.messages);
        squads.regroup();
      }
      for (const marketDate of market.filter((m) => m.date === day)) {
        // The AI's transfers and free-agent signings, and its bids for the user's players.
        const log = marketDay(world, state.season, marketDate);
        for (const pid of log.changed) out.changed.add(pid);
        out.transactions.push(...log.transactions);
        out.messages.push(...log.messages);
        out.offers.push(...log.offers);
        if (log.moved) squads.regroup();
      }
      const logs = [
        ...freeAgency
          .filter((m) => m.date === day)
          .map((m) => freeAgencyDay(world, state.season, m)),
        // From the first league match the squad limit counts: AI clubs over it trim.
        ...(limitFrom !== null && day >= limitFrom ? [trimSquads(world, state.season, day)] : []),
      ];
      for (const log of logs) {
        for (const pid of log.changed) out.changed.add(pid);
        out.transactions.push(...log.transactions);
        if (log.changed.size > 0) squads.regroup();
      }
    }
    if (options.hold?.(day, state.fixtures)) {
      out.date = day;
      out.held = true;
      break;
    }
    const before = state.fixtures.length;
    const today = playDate(state, day, play, config);
    for (const fixture of today) {
      out.played.push({ fixture, result: results.get(fixture.fid) as MatchResult });
      matchdayIncome(world, fixture, config);
      prizeIncome(world, fixture, config);
      updateHype(world.clubSeasons, fixture, (cid) => squads.strength(cid, day));
    }
    out.created.push(...state.fixtures.slice(before));
    out.date = day;
    if (today.length > 0) afterMatchday(day, false);
    options.onDay?.(day);
    if (options.stop?.(day, today)) break;
    if (options.stopWhenUserSacked && out.userSacked) break;
  }

  out.ended = nextMatchDate(state) === null;
  if (out.ended && !state.meritPaid) {
    // The season's matches are over (once per season): TV merit money by final position,
    // final positions and board verdicts, then reputation and facilities.
    const finish = new Map<number, number>();
    for (const leagueId of Object.keys(state.leagueClubs)) {
      const table = leagueTableOf(state, leagueId, config);
      meritIncome(
        world,
        leagueId,
        table.map((r) => r.cid),
        config,
      );
      for (const r of table) finish.set(r.cid, r.position);
    }
    afterMatchday(out.date, true);
    const outcome = seasonOutcome(state, config);
    const trophies = new Set([
      ...Object.values(outcome.cupWinners),
      ...Object.values(outcome.playoffWinners).flat(),
    ]);
    seasonEndStanding(world.clubs, world.clubSeasons, finish, trophies, world.config);
    state.meritPaid = true;
  }
  if (!out.ended && options.limit !== null && options.limit > out.date) {
    squads.train(out.date, options.limit);
    for (const pid of settleMonths(world, out.date, options.limit, config)) out.changed.add(pid);
    out.date = options.limit;
  }
  for (const pid of squads.changed) out.changed.add(pid);
  out.injuries = squads.injuries;
  out.trainingInjuries = squads.trainingCount();
  return out;
}
