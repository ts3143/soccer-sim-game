/**
 * Season calendar (SPEC §3.2): the dates of every league round and cup round of a season.
 *
 * Two match slots a week: weekend (Saturday) and midweek (Wednesday). Config dates are
 * MM-DD templates; each is moved to the nearest slot of its kind, so a season looks the
 * same whatever weekday the template falls on that year. Order of work:
 * 1. Cup finals take the weekend nearest their template date. That weekend is kept free
 *    of league rounds for every league entering the cup.
 * 2. Earlier cup rounds take midweeks spread evenly from early in the season to four
 *    weeks before the final, outside the country's winter break.
 *    No match is ever played on 24 or 25 December.
 * 3. League rounds take the weekends between the league's first and last dates, outside
 *    the winter break and the cup-final weekends; spare weekends are spread evenly.
 *    A league with more rounds than weekends (ENG2: 46) plays the extra rounds in
 *    midweeks spread evenly through the season, never on a cup midweek.
 */
import { addDays } from "../../common/dates";
import {
  competitionsConfig,
  type CompetitionsConfig,
  type CupConfig,
  type LeagueConfig,
} from "../../common/config/competitions";
import type { Fixture } from "../../common/schema";

export type Slot = Fixture["slot"];

/** Day of the week of each slot (0 = Sunday). */
export const SLOT_WEEKDAY: Record<Slot, number> = { weekend: 6, midweek: 3 };

/** No matches on these days anywhere (MM-DD): Christmas Eve and Christmas Day. */
export const NO_MATCH_DAYS: readonly string[] = ["12-24", "12-25"];

/** Earliest cup round: this many days after the first league round of its entrants. */
const CUP_START_AFTER_DAYS = 10;
/** Last cup round before the final: at least this many days before it. */
const CUP_LAST_ROUND_BEFORE_FINAL_DAYS = 28;

export interface RoundDate {
  /** League round number (1-based) or cup round name. */
  round: string;
  date: string;
  slot: Slot;
}

export interface SeasonCalendar {
  season: number;
  /** Per league ID: one date per round, in round order (dates strictly increasing). */
  leagues: Record<string, RoundDate[]>;
  /** Per cup ID: one date per round in config order; the final is the last. */
  cups: Record<string, RoundDate[]>;
  /** Per league ID: weekends inside its season with no round (spare weekends). */
  spareWeekends: Record<string, string[]>;
}

const weekday = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Season Y's date for an MM-DD template: July–December in Y, January–June in Y+1. */
export function seasonDate(season: number, mmdd: string): string {
  return `${Number(mmdd.slice(0, 2)) >= 7 ? season : season + 1}-${mmdd}`;
}

/** The date of the given slot nearest to `iso` (a tie goes to the earlier one). */
export function nearestSlot(iso: string, slot: Slot): string {
  const back = (weekday(iso) - SLOT_WEEKDAY[slot] + 7) % 7;
  return back <= 3 ? addDays(iso, -back) : addDays(iso, 7 - back);
}

/** Every date of a slot from `from` to `to`, both included. */
export function slotDates(from: string, to: string, slot: Slot): string[] {
  const out: string[] = [];
  let date = addDays(from, (SLOT_WEEKDAY[slot] - weekday(from) + 7) % 7);
  while (date <= to) {
    out.push(date);
    date = addDays(date, 7);
  }
  return out;
}

/** True if no match may be played in the country on `iso` (winter break or a no-match day). */
function closed(iso: string, country: string, season: number, config: CompetitionsConfig): boolean {
  return NO_MATCH_DAYS.includes(iso.slice(5)) || inWinterBreak(iso, country, season, config);
}

/** True if `iso` falls inside the country's winter break (both ends included). */
export function inWinterBreak(
  iso: string,
  country: string,
  season: number,
  config: CompetitionsConfig = competitionsConfig,
): boolean {
  const breakDates = config.countries.find((c) => c.id === country)?.winterBreak;
  if (!breakDates) return false;
  return iso >= seasonDate(season, breakDates.from) && iso <= seasonDate(season, breakDates.to);
}

/** `count` items of `items`, spread as evenly as possible (first and last included). */
function spreadEvenly<T>(items: readonly T[], count: number): T[] {
  if (count > items.length) throw new Error(`Need ${count} slots, only ${items.length} free`);
  if (count === 1) return [items[0] as T];
  return Array.from(
    { length: count },
    (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))] as T,
  );
}

function leagueBounds(league: LeagueConfig, season: number): { first: string; last: string } {
  return {
    first: nearestSlot(seasonDate(season, league.firstMatch), "weekend"),
    last: nearestSlot(seasonDate(season, league.lastMatch), "weekend"),
  };
}

function cupRounds(cup: CupConfig, season: number, config: CompetitionsConfig): RoundDate[] {
  const final = nearestSlot(seasonDate(season, cup.finalDate), "weekend");
  const entrants = config.leagues.filter((l) => cup.entrants.includes(l.id));
  const firstLeagueRound = entrants
    .map((l) => leagueBounds(l, season).first)
    .reduce((a, b) => (a < b ? a : b));
  const midweeks = slotDates(
    addDays(firstLeagueRound, CUP_START_AFTER_DAYS),
    addDays(final, -CUP_LAST_ROUND_BEFORE_FINAL_DAYS),
    "midweek",
  ).filter((d) => !closed(d, cup.country, season, config));
  const early = spreadEvenly(midweeks, cup.rounds.length - 1);
  return [
    ...early.map((date, i) => ({ round: cup.rounds[i] as string, date, slot: "midweek" as const })),
    { round: cup.rounds[cup.rounds.length - 1] as string, date: final, slot: "weekend" },
  ];
}

function leagueRounds(
  league: LeagueConfig,
  season: number,
  config: CompetitionsConfig,
  cups: Record<string, RoundDate[]>,
): { rounds: RoundDate[]; spare: string[] } {
  const { first, last } = leagueBounds(league, season);
  const ownCups = config.cups.filter((c) => c.entrants.includes(league.id));
  const cupDates = new Set(ownCups.flatMap((c) => (cups[c.id] ?? []).map((r) => r.date)));
  const free = (d: string) => !cupDates.has(d) && !closed(d, league.country, season, config);

  const weekends = slotDates(first, last, "weekend").filter(free);
  if (weekends.length >= league.rounds) {
    const used = spreadEvenly(weekends, league.rounds);
    const usedSet = new Set(used);
    return {
      rounds: used.map((date, i) => ({ round: String(i + 1), date, slot: "weekend" })),
      spare: weekends.filter((d) => !usedSet.has(d)),
    };
  }
  // More rounds than weekends: the extra rounds go midweek, spread through the season.
  const extra = league.rounds - weekends.length;
  const midweeks = slotDates(first, last, "midweek").filter(free);
  if (extra > midweeks.length)
    throw new Error(`${league.id}: not enough midweeks for ${extra} rounds`);
  const picked = Array.from(
    { length: extra },
    (_, i) => midweeks[Math.floor(((i + 0.5) * midweeks.length) / extra)] as string,
  );
  const dates = [
    ...weekends.map((date) => ({ date, slot: "weekend" as const })),
    ...picked.map((date) => ({ date, slot: "midweek" as const })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { rounds: dates.map((d, i) => ({ round: String(i + 1), ...d })), spare: [] };
}

/** The full match calendar of `season` (the year it starts: 2026 = 2026/27). */
export function seasonCalendar(
  season: number,
  config: CompetitionsConfig = competitionsConfig,
): SeasonCalendar {
  const cups: Record<string, RoundDate[]> = {};
  for (const cup of config.cups) cups[cup.id] = cupRounds(cup, season, config);
  const leagues: Record<string, RoundDate[]> = {};
  const spareWeekends: Record<string, string[]> = {};
  for (const league of config.leagues) {
    const { rounds, spare } = leagueRounds(league, season, config, cups);
    leagues[league.id] = rounds;
    spareWeekends[league.id] = spare;
  }
  return { season, leagues, cups, spareWeekends };
}
