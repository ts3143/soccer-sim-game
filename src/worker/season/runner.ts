/**
 * The day-by-day season loop, in memory (SPEC §3.2): the save (src/worker/league/game.ts)
 * persists what it returns, and the headless tools call it directly, so both run the
 * same code.
 *
 * Each processed day: training injuries and month-end money for the days since the last
 * one, then the day's dated events (the winter development update on 1 January), then its
 * matches (gate receipts and prize money). When the matches end, TV merit money is paid.
 * A day is processed when it has a match or an event; the game date is the last day
 * processed.
 */
import type { SeasonEvent } from "../../common/api";
import { competitionsConfig, type CompetitionsConfig } from "../../common/config/competitions";
import type { MatchResult } from "../../common/match";
import type { Fixture } from "../../common/schema";
import { seasonDate } from "../schedule/calendar";
import { developmentUpdate, type LoopWorld } from "./offseason";
import { matchdayIncome, meritIncome, prizeIncome, settleMonths } from "../finance/finance";
import {
  leagueTableOf,
  nextMatchDate,
  playDate,
  type PlayFixture,
  type SeasonState,
} from "./season";
import { squadPlay } from "./squads";

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
  /** Injury lengths (days) in matches and training, and how many were in training. */
  injuries: number[];
  trainingInjuries: number;
}

export interface DaysOptions {
  /** Process days up to and including this date (null: no limit). */
  limit: string | null;
  /** Stop after a day when this returns true. */
  stop?: (day: string, played: Fixture[]) => boolean;
  /** Called after each processed day (headless metrics). */
  onDay?: (day: string) => void;
  config?: CompetitionsConfig;
}

/** Processes days after `from` until the limit, the stop condition or the season's end. */
export function runDays(
  world: LoopWorld,
  state: SeasonState,
  from: string,
  options: DaysOptions,
): DaysResult {
  const config = options.config ?? competitionsConfig;
  const squads = squadPlay(state, world.clubs, world.players, config);
  const events = seasonEvents(state.season, config);
  const out: DaysResult = {
    date: from,
    played: [],
    created: [],
    events: [],
    changed: new Set(),
    ended: false,
    injuries: [],
    trainingInjuries: 0,
  };
  const results = new Map<number, MatchResult>();
  const play: PlayFixture = (fixture, setup) => {
    const result = squads.play(fixture, setup);
    results.set(fixture.fid, result);
    return result;
  };

  for (;;) {
    const nextMatch = nextMatchDate(state);
    if (nextMatch === null) break;
    const nextEvent = events.find((e) => e.date > out.date)?.date ?? null;
    const day = nextEvent !== null && nextEvent < nextMatch ? nextEvent : nextMatch;
    if (options.limit !== null && day > options.limit) break;

    squads.train(out.date, day);
    settleMonths(world, out.date, day, config);
    for (const event of events.filter((e) => e.date === day)) {
      out.events.push(event);
      if (event.kind === "winterUpdate") {
        for (const pid of developmentUpdate(world, state, day, false)) out.changed.add(pid);
      }
    }
    const before = state.fixtures.length;
    const today = playDate(state, day, play, config);
    for (const fixture of today) {
      out.played.push({ fixture, result: results.get(fixture.fid) as MatchResult });
      matchdayIncome(world, fixture, config);
      prizeIncome(world, fixture, config);
    }
    out.created.push(...state.fixtures.slice(before));
    out.date = day;
    options.onDay?.(day);
    if (options.stop?.(day, today)) break;
  }

  out.ended = nextMatchDate(state) === null;
  if (out.ended && !state.meritPaid) {
    // TV merit money by final position, when the season's matches end.
    for (const leagueId of Object.keys(state.leagueClubs)) {
      const order = leagueTableOf(state, leagueId, config).map((r) => r.cid);
      meritIncome(world, leagueId, order, config);
    }
    state.meritPaid = true;
  }
  if (!out.ended && options.limit !== null && options.limit > out.date) {
    squads.train(out.date, options.limit);
    settleMonths(world, out.date, options.limit, config);
    out.date = options.limit;
  }
  for (const pid of squads.changed) out.changed.add(pid);
  out.injuries = squads.injuries;
  out.trainingInjuries = squads.trainingCount();
  return out;
}
